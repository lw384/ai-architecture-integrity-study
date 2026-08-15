import styles from './LogoIcon.module.scss';

// ==============================|| LOGO ICON PLACEHOLDER ||============================== //

export default function LogoIcon() {
  return (
    <svg width="35" height="35" viewBox="0 0 35 35" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="35" height="35" rx="8" className={styles.background} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className={styles.label}>
        C
      </text>
    </svg>
  );
}
