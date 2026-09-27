import React, { useId } from "react";

export default function ChristmasGifts() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="winter-gifts" viewBox="0 75 260 165" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-green`} x1="30" y1="125" x2="130" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#397d61" /><stop offset="1" stopColor="#143f32" /></linearGradient>
        <linearGradient id={`${id}-red`} x1="125" y1="130" x2="215" y2="225" gradientUnits="userSpaceOnUse"><stop stopColor="#b45b67" /><stop offset="1" stopColor="#652b3b" /></linearGradient>
        <linearGradient id={`${id}-cream`} x1="70" y1="80" x2="140" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor="#f4e6c7" /><stop offset="1" stopColor="#b8a17a" /></linearGradient>
      </defs>
      <ellipse cx="127" cy="221" rx="120" ry="12" fill="#102b24" opacity=".35" />
      <g transform="rotate(-5 68 178)">
        <rect x="18" y="143" width="103" height="76" rx="5" fill={`url(#${id}-green)`} />
        <path d="M24 164 H115 M24 190 H115 M42 148 V215 M94 148 V215" stroke="#86a88a" strokeOpacity=".22" strokeWidth="2" />
        <rect x="13" y="134" width="113" height="19" rx="4" fill="#4a8466" />
        <path d="M65 136 V218" stroke="#dfc797" strokeWidth="15" />
        <path d="M65 134 C20 103 34 99 55 109 L67 129 C86 93 116 110 70 135Z" fill="#ead5ab" stroke="#c2a776" strokeWidth="1.5" />
        <path d="M57 139 L48 166 L63 158 L72 164 L70 138" fill="#d7bc89" />
        <path d="M19 134 Q40 129 56 133 M79 134 Q104 130 120 134" stroke="#eef6ed" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g>
        <rect x="132" y="164" width="100" height="56" rx="4" fill={`url(#${id}-red)`} />
        <rect x="127" y="153" width="109" height="17" rx="3" fill="#b46470" />
        <path d="M177 154 V220" stroke="#dfd5b9" strokeWidth="13" />
        <path d="M180 153 C149 125 139 145 174 154 M183 152 C212 123 228 145 185 156" stroke="#e7dcc0" strokeWidth="7" strokeLinecap="round" />
        <path d="M133 154 H160 M201 154 H230" stroke="#f1f3e8" strokeWidth="4" strokeLinecap="round" />
        <path d="M146 184 l3-5 3 5-3 5Z M211 198 l3-5 3 5-3 5Z" fill="#d49c9e" />
      </g>
      <g transform="rotate(5 137 135)">
        <rect x="97" y="111" width="74" height="40" rx="3" fill={`url(#${id}-cream)`} />
        <rect x="93" y="103" width="82" height="12" rx="3" fill="#eee1c1" />
        <path d="M133 104 V151" stroke="#8c3b49" strokeWidth="10" />
        <path d="M135 104 C106 81 111 78 131 93 L136 102 C152 75 169 94 138 104Z" fill="#a94d5b" />
      </g>
      <path d="M10 222 Q28 215 53 219 Q90 213 126 221 Q174 215 199 221 Q223 215 247 222" stroke="#e0ebe1" strokeWidth="5" strokeLinecap="round" />
      <path d="M231 150 V118 Q231 102 220 105 Q211 107 215 119" stroke="#eee9d8" strokeWidth="7" strokeLinecap="round" />
      <path d="M229 139 l5-4 M229 127 l5-4 M226 108 l4-4 M214 113 l6-2" stroke="#ac4c5b" strokeWidth="4" />
    </svg>
  );
}
