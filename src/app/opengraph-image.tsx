import { ImageResponse } from 'next/og'

export const alt = 'SwingTrade Pro - 10-Point Swing Analysis'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)',
              borderRadius: 16,
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            SwingTrade Pro
          </span>
        </div>
        <span
          style={{
            fontSize: 28,
            color: '#475569',
            maxWidth: 800,
            textAlign: 'center',
          }}
        >
          Professional swing trading analysis with portfolio and watchlist management
        </span>
      </div>
    ),
    {
      ...size,
    }
  )
}
