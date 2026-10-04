import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCK4hjx-YQgm9y_xmd7rrhrEMq6NqQk4GE",
  authDomain: "scorex-3bc3a.firebaseapp.com",
  projectId: "scorex-3bc3a",
  storageBucket: "scorex-3bc3a.firebasestorage.app",
  messagingSenderId: "69165176242",
  appId: "1:69165176242:web:a36f3e054d204c30c900ab"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export {
  app,
  auth,
  db,
  googleProvider
};