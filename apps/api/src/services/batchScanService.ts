import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { HeliusClient } from "../clients/helius.js";
import { AppError } from "../lib/errors.js";

interface RunBatchScanParams {
  mints: string[];
  topHolderLimit: number;
}

const INFRA_WALLETS = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "Vote111111111111111111111111111111111111111",
  "Sysvar1111111111111111111111111111111111111"
]);

function isLikelyInfrastructureWallet(address: string): boolean {
  return INFRA_WALLETS.has(address);
}

export class BatchScanService {
  private readonly helius = new HeliusClient(env.HELIUS_API_KEYS);

  async run(params: RunBatchScanParams) {
    if (params.mints.length < 3 || params.mints.length > 5) {
      throw new AppError(400, "Batch scan requires 3 to 5 mints.");
    }

    const scanRunId = randomUUID();

    const tokenContexts = await Promise.all(
      params.mints.map(async (mint) => {
        const overview = await this.helius.getTokenOverview(mint);
        const holdersSnapshot = await this.helius.getTokenHolders({
          mint,
          topHolderLimit: params.topHolderLimit,
          pageLimit: env.HELIUS_HOLDER_PAGE_LIMIT,
          maxPages: env.HELIUS_MAX_HOLDER_PAGES,
          decimals: overview.decimals ?? null,
          supplyUi: overview.circulatingSupply ?? overview.totalSupply ?? null
        });

        const holders = holdersSnapshot.holders.filter((holder) => !isLikelyInfrastructureWallet(holder.owner));
        return {
          mint,
          symbol: overview.symbol,
          name: overview.name,
          deployerCandidates: overview.deployerCandidates ?? [],
          holders,
          holderSet: new Set(holders.map((holder) => holder.owner)),
          holderMap: new Map(holders.map((holder) => [holder.owner, holder]))
        };
      })
    );

    const intersection = tokenContexts.reduce<Set<string>>((acc, token, index) => {
      if (index === 0) {
        return new Set(token.holderSet);
      }
      return new Set([...acc].filter((address) => token.holderSet.has(address)));
    }, new Set<string>());

    const commonWallets = [...intersection];

    const walletTransactionMap = new Map<string, unknown[]>();
    await Promise.all(
      commonWallets.map(async (wallet) => {
        try {
          const txs = await this.helius.getAddressTransactions(wallet, 80);
          walletTransactionMap.set(wallet, txs);
        } catch {
          walletTransactionMap.set(wallet, []);
        }
      })
    );

    const wallets = commonWallets
      .map((address) => {
        const txs = walletTransactionMap.get(address) ?? [];

        const tokenMatches = tokenContexts.map((token) => {
          const holder = token.holderMap.get(address);
          const directFromDeployer = this.helius.hasDirectTransferFromAnyDeployer({
            walletAddress: address,
            tokenMint: token.mint,
            deployerCandidates: token.deployerCandidates,
            transactions: txs
          });

          return {
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            holderRank: holder?.rank ?? null,
            share: holder?.share ?? null,
            directFromDeployer
          };
        });

        const devLinkedTokenCount = tokenMatches.filter((row) => row.directFromDeployer).length;
        const avgShare = tokenMatches.reduce((sum, row) => sum + (row.share ?? 0), 0) / tokenMatches.length;

        return {
          address,
          devLinkedTokenCount,
          avgShare,
          tokenMatches
        };
      })
      .sort((a, b) => {
        if (b.devLinkedTokenCount !== a.devLinkedTokenCount) {
          return b.devLinkedTokenCount - a.devLinkedTokenCount;
        }
        return b.avgShare - a.avgShare;
      });

    return {
      scanRunId,
      tokens: tokenContexts.map((token) => ({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        scannedHolders: token.holders.length,
        deployerCandidateCount: token.deployerCandidates.length
      })),
      summary: {
        requestedMintCount: params.mints.length,
        topHolderLimit: params.topHolderLimit,
        commonWalletCount: wallets.length,
        devLinkedWalletCount: wallets.filter((wallet) => wallet.devLinkedTokenCount > 0).length
      },
      wallets
    };
  }
}
