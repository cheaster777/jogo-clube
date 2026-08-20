export interface WaterQualityResult {
  category: string;
  diagnosis: string;
}

export function waterQualityForScore(score: number): WaterQualityResult {
  if (score > 150) return { category: 'Excelente', diagnosis: 'Água limpa' };
  if (score >= 101) return { category: 'Bom', diagnosis: 'Limpa ou não alterada significativamente' };
  if (score >= 61) return { category: 'Aceitável', diagnosis: 'Limpa, porém levemente impactada' };
  if (score >= 36) return { category: 'Questionável', diagnosis: 'Moderadamente impactada' };
  if (score >= 15) return { category: 'Crítico', diagnosis: 'Poluída ou impactada' };
  return { category: 'Muito crítico', diagnosis: 'Altamente poluída' };
}
