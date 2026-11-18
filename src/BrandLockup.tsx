import { brand } from './config/brand'

export default function BrandLockup({ intro = false }: { intro?: boolean }) {
  return <div className={intro ? 'auth-brand' : 'brand-lockup'}>
    <svg className="brand-symbol" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M9 9h10M9 16h14M9 23h10"/></svg>
    <div className="brand-copy"><strong>{brand.productName}<span className="brand-period">.</span></strong>{!intro && <small>TRADING WORKSPACE</small>}</div>
  </div>
}
