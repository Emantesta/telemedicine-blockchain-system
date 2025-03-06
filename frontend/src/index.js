import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ethers } from 'ethers';

const Root = () => {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const connectWallet = async () => {
      if (window.ethereum) {
        try {
          // Request account access
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const signer = provider.getSigner();
          const address = accounts[0];

          setAccount(address);
          setSigner(signer);

          // Simulate login to get JWT (replace with actual backend call)
          const message = 'Telemedicine Login';
          const signature = await signer.signMessage(message);
          const response = await fetch(`${process.env.REACT_APP_API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, signature }),
          });
          const data = await response.json();
          setToken(data.token);
        } catch (error) {
          console.error('Wallet connection failed:', error);
        }
      } else {
        console.error('Please install MetaMask!');
      }
    };

    connectWallet();
  }, []);

  if (!account || !signer || !token) {
    return <div>Loading wallet...</div>;
  }

  return (
    <React.StrictMode>
      <App account={account} signer={signer} token={token} />
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root />);
