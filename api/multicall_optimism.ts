import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    Multicall,
    ContractCallContext,
    ContractCallResults,
} from "ethereum-multicall";
import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";
import { PrismaClient } from "@prisma/client";
import { verifySignature } from "@upstash/qstash/nextjs";
import IChamberV1ABI from "../abis/IChamberV1.json";

const POOLS = [
    // ETH - SNX
    "0x4f46191bc4865813cbd2ea583046bea165b7af8f",
];

async function handler(req: VercelRequest, resp: VercelResponse) {
    const RPC_ENDPOINT = process.env.OPTIMISM_RPC_ENDPOINT ?? "";

    try {
        const dbClient = new PrismaClient();
        const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
        const multicall = new Multicall({ nodeUrl: RPC_ENDPOINT });

        const callContext: ContractCallContext[] = POOLS.map((address) => {
            return {
                reference: address,
                contractAddress: address,
                abi: IChamberV1ABI,
                calls: [
                    {
                        reference: "get_s_totalSharesCall",
                        methodName: "get_s_totalShares",
                        methodParameters: [],
                    },
                    {
                        reference: "currentUSDBalanceCall",
                        methodName: "currentUSDBalance",
                        methodParameters: [],
                    },
                ],
            };
        });

        const callContextResults: ContractCallResults = await multicall.call(
            callContext
        );

        const poolsResults = [];
        for (const address of POOLS) {
            const callContextReturns =
                callContextResults.results[address].callsReturnContext;

            const blockNumber = callContextResults.blockNumber;
            const block = await provider.getBlock(blockNumber, false);
            const blockTimestamp = block ? block.timestamp : 0;
            const totalShares = new BigNumber(
                callContextReturns[0].returnValues[0].hex
            );
            const currentUsdBalance = new BigNumber(
                callContextReturns[1].returnValues[0].hex
            );

            poolsResults.push({
                address: address,
                block: blockNumber,
                blockTime: new Date(blockTimestamp * 1e3),
                totalShares: totalShares.toString(),
                currentUsdBalance: currentUsdBalance.toString(),
            });
        }

        const pools = await dbClient.optimismPool.createMany({
            data: poolsResults,
        });

        resp.status(200).json({
            pools,
        });
    } catch (error: any) {
        resp.status(500).json({
            error: error.toString(),
        });
    }
}

export default verifySignature(handler);
