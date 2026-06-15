import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clubedeciencias.jogo',
  appName: 'Clube de Ciências',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
