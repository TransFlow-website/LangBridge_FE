/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 디자인 토큰에서 정의된 색상만 사용
        'primary-bg': '#F8FAFC',
        'sidebar-bg': '#D9EAFD',
        'surface': '#FFFFFF',
        'border': '#BCCCDC',
        'secondary-text': '#9AA6B2',
        'primary-text': '#1F2937',
        'accent': '#2563EB',
      },
      fontFamily: {
        sans: ['system-ui', 'Pretendard', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

