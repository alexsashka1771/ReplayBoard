export function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="Replay Board — главная">
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <rect x="9" y="10" width="22" height="5" rx="2" fill="white" opacity=".5" />
      <rect x="9" y="18" width="15" height="5" rx="2" fill="white" opacity=".75" />
      <path d="m10 27 6 3-6 3z" fill="white" />
      <rect x="20" y="27" width="11" height="5" rx="2" fill="white" />
    </svg>
    <span className="brand-word">replay<span>board</span></span>
  </button>
}
