export type CardType = 'family' | 'action';

export interface FamilyCard {
  id: string;
  type: 'family';
  name: string;
  score: number;
  group: string;
  description: string;
  color: string;
  image: string;
}

export interface ActionCard {
  id: string;
  type: 'action';
  title: string;
  category: 'impact' | 'mitigation';
  description: string;
  image: string;
  effect: (gameState: any, currentPlayerIndex: number) => any;
}

export const FAMILY_CARDS_DATA: Omit<FamilyCard, 'id'>[] = [
  // Score 10 - Blue
  { type: 'family', name: 'Heptageniidae', score: 10, group: 'Insecta - Ephemeroptera', description: 'Se reproduzem principalmente em riachos de fluxo rápido. Têm formato achatado e geralmente são de cor escura. Utilizam uma ampla gama de fontes de alimento.', color: '#3b82f6', image: 'assets/images/1.png' },
  { type: 'family', name: 'Helicopsychidae', score: 10, group: 'Insecta - Trichoptera', description: 'Formam abrigos helicoidais semelhantes à concha de moluscos gastrópodes. São amplamente distribuídos nos trópicos', color: '#3b82f6', image: 'assets/images/2.png' },
  { type: 'family', name: 'Sericostomatidae', score: 10, group: 'Insecta - Trichoptera', description: 'A larva vive em um abrigo cilíndrico e levemente curvado feito por grãos finos de areia. Possui distribuição cosmopolita.', color: '#3b82f6', image: 'assets/images/3.png' },
  { type: 'family', name: 'Perlidae', score: 10, group: 'Insecta - Plecoptera', description: 'São insetos predadores que vivem em riachos e rios de água doce, com hábitos semelhantes aos das efêmeras, mas com uma forma mais robusta e rastejante.', color: '#3b82f6', image: 'assets/images/4.png' },
  { type: 'family', name: 'Odontoceridae', score: 10, group: 'Insecta - Trichoptera', description: 'São encontrados em diversos ambientes aquáticos, como rios e lagos. São conhecidas por construírem casulos utilizando materiais como areia, pedaços de conchas e vegetais.', color: '#3b82f6', image: 'assets/images/5.png' },
  { type: 'family', name: 'Leuctridae', score: 10, group: 'Insecta - Plecoptera', description: 'Habitam riachos e rios frios e de fluxo rápido, com um ambiente limpo e rico em oxigênio. Se alimentam de matéria orgânica em decomposição e algas.', color: '#3b82f6', image: 'assets/images/6.png' },
  { type: 'family', name: 'Molannidae', score: 10, group: 'Insecta - Trichoptera', description: 'Vivem em corpos como riachos, rios, lagos e lagoas, geralmente em locais com areia ou silte, onde a correnteza é reduzida. As larvas constroem casulos de areia ou outros materiais.', color: '#3b82f6', image: 'assets/images/7.png' },
  { type: 'family', name: 'Capniidae', score: 10, group: 'Insecta - Plecoptera', description: 'Vivem principalmente em águas frias e bem oxigenadas, como riachos, rios e lagos. As ninfas alimentam-se de material orgânico particulado, algas, detritos, e, em algumas espécies, de outros insetos.', color: '#3b82f6', image: 'assets/images/8.png' },
  { type: 'family', name: 'Goeridae', score: 10, group: 'Insecta - Trichoptera', description: 'Suas larvas são aquáticas e frequentemente constroem casúlos protetores com diversos materiais, como pequenas pedras ou fragmentos de plantas. Vivem principalmente em riachos, rios, lagos e outras áreas de água doce.', color: '#3b82f6', image: 'assets/images/9.png' },
  { type: 'family', name: 'Leptoceridae', score: 10, group: 'Insecta - Trichoptera', description: 'São encontrados em diversos habitats de água doce ao redor do mundo, especialmente em regiões tropicais e subtropicais. Suas larvas constroem casúlos, geralmente de materiais orgânicos.', color: '#3b82f6', image: 'assets/images/10.png' },

  // Score 8 - Light Blue
  { type: 'family', name: 'Astacidae', score: 8, group: 'Malacostraca - Decapoda', description: 'Astacidae é uma família de crustáceos decápodes de água doce que agrupa lagostins originários da Europa, oeste da Ásia e da costa oeste da América do Norte', color: '#60a5fa', image: 'assets/images/11.png' },
  { type: 'family', name: 'Lestidae', score: 8, group: 'Insecta - Odonata', description: 'É uma família bastante pequena de libélulas cosmopolitas, de grande porte e esbeltas, conhecidas comumente como asas ou libélulas de asas abertas.', color: '#60a5fa', image: 'assets/images/12.png' },
  { type: 'family', name: 'Calopterygidae', score: 8, group: 'Insecta - Odonata', description: 'É uma família de libélulas. Eles são comumente conhecidos como libélulas de asas largas, demoiselles ou joalherias', color: '#60a5fa', image: 'assets/images/13.png' },
  { type: 'family', name: 'Gomphidae', score: 8, group: 'Insecta - Odonata', description: 'São uma família de libélulas caracterizadas pela presença de um alargamento em forma de clube na extremidade do abdômen, que é mais pronunciado nos machos.', color: '#60a5fa', image: 'assets/images/14.png' },
  { type: 'family', name: 'Cordulegastridae', score: 8, group: 'Insecta - Odonata', description: 'São larvas grandes, atingindo até 45 mm. Vivem comumente associadas ao sedimento de fundo dos corpos aquáticos.', color: '#60a5fa', image: 'assets/images/15.png' },
  { type: 'family', name: 'Aeshnidae', score: 8, group: 'Insecta - Odonata', description: 'Aeshnidae é uma família de libélulas, também conhecidas como "falcões" ou "darners", encontradas em quase todo o mundo. Esta família é composta por mais de 50 gêneros e mais de 450 espécies.', color: '#60a5fa', image: 'assets/images/16.png' },
  { type: 'family', name: 'Corduliidae', score: 8, group: 'Insecta - Odonata', description: 'Os cordúlidos são uma família de odonatos anisópteros conhecidos como libélulas esmeralda. Estes insetos recebem seu nome devido a seus deslumbrantes olhos verdes', color: '#60a5fa', image: 'assets/images/17.png' },

  // Score 7 - Green
  { type: 'family', name: 'Pyralidae', score: 7, group: 'Insecta - Lepidoptera', description: 'Estão geralmente associadas a ambientes lênticos ou áreas marginais de rios, onde se alimentam de plantas aquáticas e construem casulos com material vegetal.', color: '#22c55e', image: 'assets/images/18.png' },
  { type: 'family', name: 'Nemouridae', score: 7, group: 'Insecta - Plecoptera', description: 'São frequentemente encontrados em ambientes aquáticos de água doce e regiões frias. Em fase de larva, alimentam-se de detritos, folhas, bactérias, diatomáceas e algas.', color: '#22c55e', image: 'assets/images/19.png' },
  { type: 'family', name: 'Polycentropodidae', score: 7, group: 'Insecta - Trichoptera', description: 'São insetos aquáticos que vivem em riachos, lagos e lagoas. As larvas são geralmente predadoras, alimentando-se de outros insetos aquáticos, como larvas de mosquitos.', color: '#22c55e', image: 'assets/images/20.png' },
  { type: 'family', name: 'Gripopterygidae', score: 7, group: 'Insecta - Plecoptera', description: 'Ocorrem no Sul até a região central do Brasil. Costumam viver em ambientes com oxigênio abundante, sendo encontradas, principalmente, em detritos vegetais ou sobre pedras.', color: '#22c55e', image: 'assets/images/21.png' },
  { type: 'family', name: 'Ephemerellidae', score: 7, group: 'Insecta - Ephemeroptera', description: 'Phemerellidae é uma família de insetos aquáticos cuja fase adulta dura muito pouco, apenas o tempo para a reprodução. Sua presença é um forte indicador de que a água está limpa e saudável.', color: '#22c55e', image: 'assets/images/22.png' },
  { type: 'family', name: 'Ecnomidae', score: 7, group: 'Insecta - Trichoptera', description: 'Ecnomidae é uma família de insetos aquáticos cujas larvas constroem abrigos fixos com seda e pequenos grãos. Essas larvas são predadoras e desempenham um papel importante na cadeia alimentar.', color: '#22c55e', image: 'assets/images/23.png' },
  { type: 'family', name: 'Psephenidae', score: 7, group: 'Insecta - Coleoptera', description: 'A família Psephenidae é de besouros aquáticos, conhecidos como "moedas d\'água", cujas larvas, achatadas e redondas, vivem presas a rochas em águas limpas e de correnteza.', color: '#22c55e', image: 'assets/images/24.png' },

  // Score 6 - Light Green
  { type: 'family', name: 'Viviparidae', score: 6, group: 'Mollusca - Gastropoda', description: 'São caracóis de água doce e tem um casco protetor que contém uma tampa protetora (opérculo).', color: '#86efac', image: 'assets/images/25.png' },
  { type: 'family', name: 'Neritidae', score: 6, group: 'Mollusca - Gastropoda', description: 'Podem ser encontradas em vários habitats incluindo lagos, pântanos e áreas ribeirinhas. São predadores vorazes de pequenas presas aquáticas.', color: '#86efac', image: 'assets/images/26.png' },
  { type: 'family', name: 'Ancylidae', score: 6, group: 'Mollusca - Gastropoda', description: 'Podem ser encontradas em vários habitats incluindo lagos, pântanos e áreas ribeirinhas. São predadores vorazes de pequenas presas aquáticas.', color: '#86efac', image: 'assets/images/27.png' },
  { type: 'family', name: 'Corophiidae', score: 6, group: 'Crustacea - Amphipoda', description: 'Corophiidae são pequenos crustáceos aquáticos, importantes para a cadeia alimentar e indicadores da qualidade da água.', color: '#86efac', image: 'assets/images/28.png' },
  { type: 'family', name: 'Hyriidae', score: 6, group: 'Mollusca - Bivalvia', description: 'São moluscos bivalves de água doce e nativos da América do Sul, Nova Zelândia e Austrália. Podem ser parasitas de peixes no estágio larval.', color: '#86efac', image: 'assets/images/29.png' },
  { type: 'family', name: 'Atyidae', score: 6, group: 'Crustacea - Decapoda', description: 'São camarões de água doce comuns em climas tropicais e temperados', color: '#86efac', image: 'assets/images/30.png' },
  { type: 'family', name: 'Palaemonidae', score: 6, group: 'Crustacea - Decapoda', description: 'São camarões predominantemente marinhos mas com alguns representantes de água doce', color: '#86efac', image: 'assets/images/31.png' },

  // Score 5 - Yellow
  { type: 'family', name: 'Elmidae', score: 5, group: 'Insecta - Coleoptera', description: 'Ele come algas, protozoários e bactérias das pedras. Corpo cilíndrico, muitas vezes com cerdas e tubérculos, e uma cabeça mais estreita que o tórax', color: '#fde047', image: 'assets/images/32.png' },
  { type: 'family', name: 'Dryopidae', score: 5, group: 'Insecta - Coleoptera', description: 'Também conhecidos como besouros de lama, alimentam-se principalmente de detritos e algas que crescem em ambientes aquáticos. Eles são encontrados em diversos tipos de corpos d\'água.', color: '#fde047', image: 'assets/images/33.png' },
  { type: 'family', name: 'Clambidae', score: 5, group: 'Insecta - Coleoptera', description: 'São encontrados em habitats úmidos e ricos em matéria orgânica. Tanto as larvas quanto os adultos se alimentam de fungos.', color: '#fde047', image: 'assets/images/34.png' },
  { type: 'family', name: 'Oligoneuridae', score: 5, group: 'Insecta - Ephemeroptera', description: 'É encontrada exclusivamente em ambientes lóticos (correntes de água). As ninfas se alimentam de detritos (folhas e fragmentos de animais). Já os adultos não se alimentam.', color: '#fde047', image: 'assets/images/35.png' },
  { type: 'family', name: 'Simuliidae', score: 5, group: 'Insecta - Diptera', description: 'Os Simuliidae, conhecidos como borrachudos ou piuns, são pequenos mosquitos. Suas fêmeas se alimentam de sangue e podem transmitir doenças. As larvas vivem em rios e córregos.', color: '#fde047', image: 'assets/images/36.png' },
  { type: 'family', name: 'Tipulidae', score: 5, group: 'Insecta - Diptera', description: 'Conhecidos como típulas ou moscas-grua, que se assemelham a mosquitos grandes, mas não são verdadeiros mosquitos e são inofensivos para os humanos.', color: '#fde047', image: 'assets/images/37.png' },
  { type: 'family', name: 'Polymitarcyidae', score: 5, group: 'Insecta - Ephemeroptera', description: 'Habita ambientes aquáticos tanto lênticos (águas paradas) como lóticos (águas correntes). As ninfas se alimentam de detritos, bactérias, fragmentos de animais e algas.', color: '#fde047', image: 'assets/images/38.png' },

  // Score 4 - Orange
  { type: 'family', name: 'Stratiomyidae', score: 4, group: 'Insecta - Diptera', description: 'A família Stratiomyidae, também conhecida como moscas-soldado, é um grupo de insetos pertencente à ordem Diptera (moscas). São conhecidos por suas diversas características morfológicas.', color: '#fb923c', image: 'assets/images/39.png' },
  { type: 'family', name: 'Limoniidae', score: 4, group: 'Insecta - Diptera', description: 'Os Limoniidae são uma grande família de moscas conhecidas como moscas-das-neves ou moscas-pernuda. São encontrados em ambientes úmidos em todo o mundo.', color: '#fb923c', image: 'assets/images/40.png' },
  { type: 'family', name: 'Anthomyidae', score: 4, group: 'Insecta - Diptera', description: 'Os Anthomyiidae são uma família de moscas, com mais de 2.000 espécies. Muitas se parecem com pequenas moscas-domésticas, e algumas larvas são pragas agrícolas.', color: '#fb923c', image: 'assets/images/41.png' },
  { type: 'family', name: 'Sialidae', score: 4, group: 'Insecta - Megaloptera', description: 'Quando são larvas se alimentam de outros invertebrados aquáticos, mas em sua fase adulta se alimentam principalmente de liquidos. São escuros e de corpo compacto.', color: '#fb923c', image: 'assets/images/42.png' },
  { type: 'family', name: 'Psychodidae', score: 4, group: 'Insecta - Diptera', description: 'Os Psychodidae, conhecidos como moscas-de-banheiro ou mosquitos-de-esgoto, são pequenas moscas peludas. Suas larvas vivem em ambientes ricos em matéria orgânica.', color: '#fb923c', image: 'assets/images/43.png' },
  { type: 'family', name: 'Baetidae', score: 4, group: 'Insecta - Ephemeroptera', description: 'As ninfas são conhecidas por se alimentarem de diversos materiais orgânicos e os adultos não se alimentam. São amplamente distribuídos em diversos ambientes aquáticos.', color: '#fb923c', image: 'assets/images/44.png' },
  { type: 'family', name: 'Dixidae', score: 4, group: 'Insecta - Diptera', description: 'São pequenos mosquitos com pernas finas. As larvas podem ser encontradas em ambientes aquáticos, como em cachoeiras e locais com água parada, onde filtram partículas orgânicas.', color: '#fb923c', image: 'assets/images/45.png' },

  // Score 3 - Dark Orange
  { type: 'family', name: 'Nepidae', score: 3, group: 'Insecta - Hemiptera', description: 'Vivem em ambientes lênticos. São conhecidos como "escorpiões d\'água". São carnívoros, comem aranhas, vermes, pequenos peixes entre outros pequenos animais aquáticos.', color: '#f97316', image: 'assets/images/46.png' },
  { type: 'family', name: 'Notonectidae', score: 3, group: 'Insecta - Hemiptera', description: 'A família Notonectidae, também conhecida como barqueiros, é um grupo de insetos aquáticos que nadam de costas, com o abdômen voltado para cima.', color: '#f97316', image: 'assets/images/47.png' },
  { type: 'family', name: 'Hydrometridae', score: 3, group: 'Insecta - Hemiptera', description: 'As Hydrometridae são percevejos aquáticos longos e finos, que caminham sobre a água. São predadoras de pequenos invertebrados e vivem em ambientes calmos.', color: '#f97316', image: 'assets/images/48.png' },
  { type: 'family', name: 'Veliidae', score: 3, group: 'Insecta - Hemiptera', description: 'É uma família de insetos aquáticos conhecidos como "patinhade-água". São predadores que utilizam suas patas dianteiras para detectar vibrações na água.', color: '#f97316', image: 'assets/images/49.png' },
  { type: 'family', name: 'Mesoveliidae', score: 3, group: 'Insecta - Hemiptera', description: 'As Mesoveliidae são pequenos percevejos semi-aquáticos. Eles caminham na água, são predadores ou necrófagos de invertebrados, e podem ter asas ou não.', color: '#f97316', image: 'assets/images/50.png' },
  { type: 'family', name: 'Gyrinidae', score: 3, group: 'Insecta - Coleoptera', description: 'Conhecidos como "besouros-giratórios", habitam principalmente ambientes de água doce, como lagos, lagoas, rios e riachos. Preferem águas paradas ou de fluxo lento.', color: '#f97316', image: 'assets/images/51.png' },
  { type: 'family', name: 'Gerridae', score: 3, group: 'Insecta - Hemiptera', description: 'Conhecidas como patinadores-de-água ou aranhas-d\'água, são insetos predadores que se alimentam principalmente de outros insetos que caem na água.', color: '#f97316', image: 'assets/images/52.png' },

  // Score 2 - Red-Orange
  { type: 'family', name: 'Thaumaleidae', score: 2, group: 'Insecta - Diptera', description: 'Thaumaleidae são pequenas moscas que vivem em áreas úmidas e frias, perto de riachos e cachoeiras. Suas larvas vivem em superfícies molhadas.', color: '#ea580c', image: 'assets/images/53.png' },
  { type: 'family', name: 'Ephydridae', score: 2, group: 'Insecta - Diptera', description: 'Ephydridae são pequenas moscas que vivem em áreas úmidas e salinas. Têm corpo escuro e larvas aquáticas resistentes, que suportam ambientes extremos.', color: '#ea580c', image: 'assets/images/54.png' },
  { type: 'family', name: 'Culicidae', score: 2, group: 'Insecta - Diptera', description: 'Culicidae são mosquitos com corpo fino e asas longas. As fêmeas picam para obter sangue. Suas larvas vivem na água e os adultos em locais úmidos.', color: '#ea580c', image: 'assets/images/55.png' },
  { type: 'family', name: 'Chironomidae', score: 2, group: 'Insecta - Diptera', description: 'Chironomidae são insetos semelhantes a mosquitos mas não picam. Suas larvas vivem na água, inclusive em lugares poluídos, e os adultos vivem perto de ambientes aquáticos.', color: '#ea580c', image: 'assets/images/56.png' },

  // Score 1 - Red
  { type: 'family', name: 'Syrphidae', score: 1, group: 'Insecta - Diptera', description: 'Possuem um corpo cilíndrico com um longo apêndice respiratório semelhante a uma cauda. Ocorrem em ambientes com muita matéria orgânica.', color: '#dc2626', image: 'assets/images/57.png' },
  { type: 'family', name: 'Oligochaeta', score: 1, group: 'Annelida', description: 'Os Oligochaeta são uma classe de anelídeos que inclui minhocas. Eles são caracterizados por terem poucos pelos ou cerdas no corpo segmentado.', color: '#dc2626', image: 'assets/images/58.png' },
];

export const ACTION_CARDS_DATA: Omit<ActionCard, 'id' | 'effect'>[] = [
  {
    type: 'action',
    title: 'Despejo de esgoto',
    category: 'impact',
    description: 'Esgoto clandestino passou a ser despejado no seu corpo aquático. Você perdeu 2 famílias com pontuação 10 ou 8',
    image: 'assets/images/59.png'
  },
  {
    type: 'action',
    title: 'Drift — arrasto',
    category: 'impact',
    description: 'O forte regime de chuvas “arrastou” alguns organismos do seu corpo aquático. O seu colega anterior deverá eliminar aleatoriamente 5 cartas do seu monte',
    image: 'assets/images/60.png'
  },
  {
    type: 'action',
    title: 'Peixe exótico',
    category: 'impact',
    description: 'Uma espécie de peixe exótico e predador voraz é liberado no seu corpo aquático e se reproduz, consumindo grande quantidade de macroinvertebrados. Seu proximo colega deverá eliminar 5 cartas suas aleatoriamente.',
    image: 'assets/images/61.png'
  },
  {
    type: 'action',
    title: 'Replantio de mata ciliar',
    category: 'mitigation',
    description: 'A mata ciliar do seu corpo aquático sofreu reflorestamento, impactando positivamente a biodiversidade. Pegue 1 carta de maior pontuação disponível de cada um dos seus oponentes.',
    image: 'assets/images/62.png'
  },
  {
    type: 'action',
    title: 'Regularização de esgotos',
    category: 'mitigation',
    description: 'Em um esforço da comunidade, redes clandestinas de esgoto foram regularizadas, deixando de ser despejado nos corpos aquáticos. Pesque 3 cartas do monte.',
    image: 'assets/images/63.png'
  },
  {
    type: 'action',
    title: 'Educação Ambiental',
    category: 'mitigation',
    description: 'A comunidade assistiu palestras de educação ambiental e foi conscientizada a não jogar resíduos nos corpos aquáticos e fazer o bom manejo de defensivos agrícolas. Pesque 5 cartas do monte.',
    image: 'assets/images/64.png'
  },
];

export interface WaterQuality {
  class: string;
  range: string;
  minScore: number;
  maxScore: number;
  category: string;
  diagnosis: string;
  color: string;
}

export const WATER_QUALITY_DATA: WaterQuality[] = [
  { class: 'I', range: '> 150', minScore: 151, maxScore: Infinity, category: 'Excelente', diagnosis: 'Água limpa', color: '#059669' },
  { class: 'I', range: '101 - 150', minScore: 101, maxScore: 150, category: 'Bom', diagnosis: 'Limpa ou não alterada significativamente', color: '#10b981' },
  { class: 'II', range: '61 - 100', minScore: 61, maxScore: 100, category: 'Aceitável', diagnosis: 'Limpa, porém levemente impactada', color: '#3b82f6' },
  { class: 'III', range: '36 - 60', minScore: 36, maxScore: 60, category: 'Questionável', diagnosis: 'Moderadamente impactada', color: '#f59e0b' },
  { class: 'IV', range: '15 - 35', minScore: 15, maxScore: 35, category: 'Crítico', diagnosis: 'Poluída ou impactada', color: '#ef4444' },
  { class: 'V', range: '< 15', minScore: 0, maxScore: 14, category: 'Muito crítico', diagnosis: 'Altamente poluída', color: '#b91c1c' },
];
