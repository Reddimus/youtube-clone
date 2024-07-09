'use client';

import Image from "next/image";
import Link from "next/link"

import styles from "./navbar.module.css";
import SignIn from "./sign-in";
import { onAuthStateChangedHelper } from "../firebase/firebase";
import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import Upload from "./upload";

export default function Navbar() {
  // Initialize user state
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChangedHelper((user) => {
      setUser(user);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  });

  return (
    <nav className={styles.nav}>
      <Link href="/">
        <Image width={90} height={20}
          // src="/redd-logo.svg" alt="yt-logo" />
          src="/yt-logo.svg" alt="redd-logo" />
      </Link>
      {
        user && <Upload /> // If user is signed in show upload icon
      }
      <SignIn user={user}/>
    </nav>
  );
}