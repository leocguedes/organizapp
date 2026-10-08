import React from 'react';import{createRoot}from'react-dom/client';import'./index.css';import App from './App';

if(import.meta.env.PROD&&'serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(()=>{});
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);