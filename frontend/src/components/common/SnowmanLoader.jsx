import React, { useId } from "react";

export default function SnowmanLoader({ showTrail = false }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="snowman-loader" viewBox="0 0 200 180" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx=".3" cy=".2" r=".85">
          <stop stopColor="#fff" /><stop offset=".7" stopColor="#e5f1f1" /><stop offset="1" stopColor="#b6d3d3" />
        </radialGradient>
        <linearGradient id={`${id}-trail`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#e8f5f1" stopOpacity="0" />
          <stop offset=".25" stopColor="#e8f5f1" stopOpacity=".8" />
          <stop offset=".75" stopColor="#e8f5f1" stopOpacity=".8" />
          <stop offset="1" stopColor="#e8f5f1" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-road-clip`}><rect x="25" y="155" width="150" height="22" rx="11" /></clipPath>
      </defs>
      {showTrail && <g className="snowman-road">
        <path d="M22 161 Q55 151 100 158 Q143 151 178 161 Q142 173 100 168 Q57 174 22 161Z" fill={`url(#${id}-trail)`} />
        <g clipPath={`url(#${id}-road-clip)`}>
          <g className="snowman-tracks" fill="#7ba397" opacity=".55">
            {[0, 1, 2, 3, 4, 5].map(i => <g key={i} transform={`translate(${i * 36} 0)`}>
              <ellipse cx="30" cy="160" rx="4" ry="1.3" />
              <ellipse cx="47" cy="165" rx="4" ry="1.3" />
            </g>)}
          </g>
        </g>
      </g>}
      <ellipse className="snowman-shadow" cx="100" cy="158" rx="35" ry="5" fill="#92c9b4" opacity=".12" />
      <g className="snowman-foot snowman-foot--left"><ellipse cx="86" cy="150" rx="15" ry="7" fill="#daeaea" /></g>
      <g className="snowman-foot snowman-foot--right"><ellipse cx="116" cy="150" rx="15" ry="7" fill="#eff8f7" /></g>
      <g className="snowman-body">
        <path className="snowman-arm" d="M70 99 L46 80 M48 82 L48 72 M49 83 L38 81" stroke="#a58562" strokeWidth="3" strokeLinecap="round" />
        <path className="snowman-arm snowman-arm--right" d="M129 98 L150 78 M149 80 L159 78 M149 80 L149 68" stroke="#a58562" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="101" cy="115" rx="34" ry="35" fill={`url(#${id})`} />
        <circle cx="100" cy="69" r="25" fill={`url(#${id})`} />
        <path d="M75 60 Q73 29 98 28 Q125 27 126 58Z" fill="#24694c" />
        <path d="M82 44 Q99 36 118 43 M85 36 Q99 29 110 34" stroke="#43916d" strokeWidth="2" />
        <rect x="73" y="51" width="55" height="12" rx="6" fill="#b8d5bc" />
        <circle cx="99" cy="26" r="9" fill="#e7eed9" />
        <g className="snowman-eyes"><circle cx="93" cy="70" r="2.2" fill="#233b36" /><circle cx="110" cy="70" r="2.2" fill="#233b36" /></g>
        <path d="M102 73 L122 78 L102 80Z" fill="#e99b55" />
        <path d="M94 82 Q99 86 105 84" stroke="#41685b" strokeWidth="1.7" strokeLinecap="round" />
        <ellipse cx="85" cy="79" rx="4" ry="2.5" fill="#e4aaa4" opacity=".65" />
        <path className="snowman-scarf-tail" d="M117 91 Q143 91 154 105 L146 120 Q136 102 112 104Z" fill="#a7404f" />
        <path d="M79 87 Q99 96 122 85 L124 96 Q102 106 77 98Z" fill="#bb5360" />
        <path d="M84 91 Q100 97 118 91" stroke="#df9491" strokeWidth="1.5" />
        <circle cx="103" cy="113" r="2.5" fill="#385b4d" /><circle cx="104" cy="126" r="2.5" fill="#385b4d" />
      </g>
      <g className="snowman-puffs" fill="#e6f2ee"><circle cx="53" cy="148" r="3" /><circle cx="38" cy="143" r="2" /><circle cx="26" cy="150" r="1.5" /></g>
    </svg>
  );
}
