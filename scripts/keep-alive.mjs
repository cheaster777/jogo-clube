import { createClient } from '@supabase/supabase-js';

// Usamos as chaves públicas (podem ser expostas com segurança, 
// pois as políticas RLS garantem o controle).
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://qnztqmhhfiphfnqhortt.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xh0c02ExRGE1GqZKPtxQhw_Wu1-p4Kn';

const supabase = createClient(supabaseUrl, supabaseKey);

async function pingSupabase() {
  console.log('Iniciando rotina Keep-Alive para o Supabase...');
  
  try {
    // 1. Busca o valor atual
    const { data, error: fetchError } = await supabase
      .from('projeto_ativo')
      .select('ativo')
      .limit(1)
      .single();

    if (fetchError) {
      throw new Error(`Erro ao buscar o status atual: ${fetchError.message}`);
    }

    const valorAtual = data?.ativo === 'sim' ? 'sim' : 'nao';
    const novoValor = valorAtual === 'sim' ? 'nao' : 'sim';
    
    console.log(`Valor atual é '${valorAtual}'. Invertendo para '${novoValor}'...`);

    // 2. Atualiza invertendo o valor
    const { error: updateError } = await supabase
      .from('projeto_ativo')
      .update({ ativo: novoValor })
      .neq('id', 0); // Atualiza tudo (geralmente só tem 1 linha)

    if (updateError) {
      throw new Error(`Erro ao atualizar o status: ${updateError.message}`);
    }

    console.log('✅ Ping efetuado com sucesso! Supabase reiniciou o contador de 7 dias de inatividade.');

  } catch (error) {
    console.error('❌ Falha no Keep-Alive:', error.message);
    process.exit(1);
  }
}

pingSupabase();
