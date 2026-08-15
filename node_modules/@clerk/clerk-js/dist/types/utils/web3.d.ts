export declare const web3: () => {
    getWeb3Identifier: (params: {
        provider: import("@clerk/shared/types/web3").Web3Provider;
        walletName?: string;
    }) => Promise<string>;
    generateWeb3Signature: import("@clerk/shared/types/web3Wallet").GenerateSignature;
    getMetamaskIdentifier: () => Promise<string>;
    getCoinbaseWalletIdentifier: () => Promise<string>;
    getOKXWalletIdentifier: () => Promise<string>;
    getBaseIdentifier: () => Promise<string>;
    getSolanaIdentifier: (walletName: string) => Promise<string>;
    generateSignatureWithMetamask: (params: {
        identifier: string;
        nonce: string;
    }) => Promise<string>;
    generateSignatureWithCoinbaseWallet: (params: {
        identifier: string;
        nonce: string;
    }) => Promise<string>;
    generateSignatureWithOKXWallet: (params: {
        identifier: string;
        nonce: string;
    }) => Promise<string>;
    generateSignatureWithBase: (params: {
        identifier: string;
        nonce: string;
    }) => Promise<string>;
    generateSignatureWithSolana: (params: {
        identifier: string;
        nonce: string;
    } & {
        walletName: string;
    }) => Promise<string>;
};
