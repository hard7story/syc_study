// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 배포 시 저장소 이름이 base 경로가 된다.
// 커스텀 도메인이나 user.github.io 저장소를 쓰면 SITE_BASE=/ 로 오버라이드.
const base = process.env.SITE_BASE ?? '/syc_study';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.github.io',
  base,
  vite: {
    plugins: [tailwindcss()],
  },
});
