import LogoIcon from './LogoIcon';

// ==============================|| LOGO PLACEHOLDER ||============================== //

export default function LogoMain() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoIcon />
      <span className="whitespace-nowrap text-lg font-bold text-text">CRM Baseline</span>
    </span>
  );
}
