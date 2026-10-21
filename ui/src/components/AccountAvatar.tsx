import { useState, useEffect } from 'react'
import { PLATFORM_META } from '../stores/platforms'

export interface AccountAvatarProps {
  src?: string | null
  platform: string
  className?: string
}

export default function AccountAvatar({ src, platform, className = '' }: AccountAvatarProps) {
  const [failed, setFailed] = useState(false)
  const meta = PLATFORM_META[platform]

  useEffect(() => {
    setFailed(false)
  }, [src])

  const iconClass = meta?.icon || (platform === 'facebook' ? 'fa-brands fa-facebook' : platform === 'instagram' ? 'fa-brands fa-instagram' : '')

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden text-white ${className}`}
      style={{ backgroundColor: meta?.color }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : iconClass ? (
        <i className={`${iconClass} w-full h-full flex items-center justify-center text-white`} aria-hidden="true" />
      ) : null}
    </span>
  )
}
