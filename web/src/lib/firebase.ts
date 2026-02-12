import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  projectId: "astroweb-dev",
  appId: "1:879736537444:web:4a2e099a7e54cb25987a71",
  storageBucket: "astroweb-dev.firebasestorage.app",
  apiKey: "AIzaSyCWCMM-fm53njNMgbYQb-EmDxtKE3-F8u8",
  authDomain: "astroweb-dev.firebaseapp.com",
  messagingSenderId: "879736537444",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
