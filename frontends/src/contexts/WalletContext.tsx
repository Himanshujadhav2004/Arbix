'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type WalletContextType = {
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  connected: boolean;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  signature: Uint8Array | null;
};

export const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connect: async () => {},
  disconnect: async () => {},
  connected: false,
  signTransaction: async (tx) => tx,
  signature: null,
});

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [signature, setSignature] = useState<Uint8Array | null>(null);

  useEffect(() => {
    const initializeWallet = async () => {
      const provider = window.okxwallet?.solana;
      if (!provider) return;

      try {
        // Try silent connect
        const { publicKey } = await provider.connect({ onlyIfTrusted: true });
        setPublicKey(publicKey.toString());
      } catch (error) {
        console.log('Silent connect failed', error);
      }
    };

    if (typeof window !== 'undefined') {
      initializeWallet();
    }
  }, []);

  const connect = async () => {
    const provider = window.okxwallet?.solana;
    if (!provider) {
      window.open('https://www.okx.com/download', '_blank');
      throw new Error('OKX Wallet not installed');
    }

    try {
      const { publicKey } = await provider.connect();
      setPublicKey(publicKey.toString());

      // Verify ownership
      const message = new TextEncoder().encode('Verify wallet ownership');
      const signedMessage = await provider.signMessage(message);
      setSignature(signedMessage);
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  };

  const disconnect = async () => {
    const provider = window.okxwallet?.solana;
    if (provider) {
      await provider.disconnect();
      setPublicKey(null);
      setSignature(null);
    }
  };

  const signTransaction = async (tx: VersionedTransaction) => {
    const provider = window.okxwallet?.solana;
    if (!provider) throw new Error('Wallet not connected');
    
    try {
      return await provider.signTransaction(tx);
    } catch (error) {
      console.error('Signing error:', error);
      throw error;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connect,
        disconnect,
        connected: !!publicKey,
        signTransaction,
        signature,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);