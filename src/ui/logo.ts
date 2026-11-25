/** An anti-radiation missile (HARM-style), nose down. CSS rotates it where a horizontal one is needed. */
export function missileSvg(cls = 'missile'): string {
  return `<svg class="${cls}" viewBox="0 0 24 84" role="img" aria-label="Anti-radiation missile" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">
      <path d="M12 2c3 0 4 3 4 6v50H8V8c0-3 1-6 4-6z" transform="translate(0 0)"/>
      <path d="M8 58h8c0 8-2 18-4 24-2-6-4-16-4-24z"/>
      <path d="M8 4L1 14v8l7-4zM16 4l7 10v8l-7-4z" opacity=".85"/>
      <path d="M8 38L3 46v5l5-3zM16 38l5 8v5l-5-3z" opacity=".85"/>
    </g>
    <g fill="var(--bg, #0b1418)"><rect x="8" y="26" width="8" height="1.6"/><rect x="8" y="55" width="8" height="1.6"/><circle cx="12" cy="70" r="1.6"/></g>
  </svg>`;
}

