import Link from "next/link";

import styles from "./message.module.css";

export default function NotFound() {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>That reel is empty</h1>
      <p className={styles.body}>
        The video you asked for does not exist, or it has not finished
        developing yet.
      </p>
      <Link href="/" className={styles.action}>
        Back to the reel
      </Link>
    </div>
  );
}
