// Questionário comportamental — versão fixa. Todos respondem as mesmas perguntas, na mesma ordem,
// com as mesmas alternativas e os mesmos critérios. Para mudar perguntas ou pontos, crie uma NOVA
// versão (ex.: "v2") e mantenha a anterior: testes antigos são sempre lidos com a versão em que
// foram respondidos.
//
// Critérios (documentados e exibidos em Configurações → Teste comportamental):
// - Cada alternativa vale de 0 a 3 pontos dentro da competência da pergunta.
//     3 = comportamento mais alinhado ao esperado no trabalho
//     2 = adequado, com alguma ressalva
//     1 = pouco efetivo ou dependente de terceiros
//     0 = tende a gerar problema no dia a dia
// - Perguntas situacionais (o que a pessoa FAZ numa situação) têm peso 1.
//   Perguntas de autopercepção (como a pessoa SE VÊ) têm peso 0,5, por serem menos confiáveis.
// - Nota da competência (0–100) = pontos ponderados obtidos ÷ pontos ponderados possíveis.
// - Indicador geral = média simples das 8 competências (cada uma pesa igual, independentemente
//   do número de perguntas).
// - Faixas: 80–100 Forte · 60–79 Adequado · 40–59 Atenção · 0–39 Investigar.

export const QUESTIONNAIRE_VERSION = "v1";

export const COMPETENCIES = [
  { key: "team", name: "Trabalho em equipe", trait: "Colaborativo" },
  { key: "emotional", name: "Controle emocional", trait: "Equilibrado" },
  { key: "goals", name: "Metas e resultados", trait: "Orientado a resultados" },
  { key: "communication", name: "Comunicação", trait: "Comunicativo" },
  { key: "proactivity", name: "Proatividade", trait: "Proativo" },
  { key: "responsibility", name: "Responsabilidade", trait: "Comprometido" },
  { key: "problems", name: "Resolução de problemas", trait: "Analítico" },
  { key: "adaptability", name: "Adaptabilidade", trait: "Flexível" },
] as const;

export type CompetencyKey = (typeof COMPETENCIES)[number]["key"];

export type Option = {
  text: string;
  points: 0 | 1 | 2 | 3;
  /** Como a escolha aparece no texto do relatório (3ª pessoa, sem julgamento). */
  insight: string;
};

export type Question = {
  n: number;
  competency: CompetencyKey;
  kind: "situational" | "self";
  text: string;
  options: [Option, Option, Option, Option];
};

export const WEIGHT = { situational: 1, self: 0.5 } as const;

export const QUESTIONS: Question[] = [
  // ───── 1. Trabalho em equipe ─────
  {
    n: 1, competency: "team", kind: "situational",
    text: "Quando um colega está com dificuldades para realizar uma tarefa, como você reage?",
    options: [
      { text: "Espero ele me pedir ajuda; não gosto de interferir no trabalho dos outros.", points: 1, insight: "espera ser chamado antes de ajudar um colega" },
      { text: "Paro o que estou fazendo na hora e resolvo para ele.", points: 2, insight: "ajuda o colega de imediato, mesmo deixando as próprias tarefas de lado" },
      { text: "Pergunto se precisa de ajuda e combino como posso apoiar sem atrasar o que é meu.", points: 3, insight: "oferece ajuda e combina como apoiar sem prejudicar as próprias entregas" },
      { text: "Aviso o líder para que ele decida quem deve ajudar.", points: 1, insight: "prefere levar a dificuldade do colega à liderança" },
    ],
  },
  {
    n: 2, competency: "team", kind: "situational",
    text: "Quando existe uma divergência de opinião dentro da equipe, como costuma agir?",
    options: [
      { text: "Defendo meu ponto de vista até convencer os outros.", points: 1, insight: "insiste no próprio ponto de vista em divergências" },
      { text: "Fico em silêncio para evitar conflito.", points: 0, insight: "evita se posicionar quando há divergência" },
      { text: "Aceito o que a maioria decidir, mesmo discordando.", points: 2, insight: "acompanha a decisão do grupo mesmo discordando" },
      { text: "Exponho minha opinião, ouço os argumentos e busco a melhor solução para o grupo.", points: 3, insight: "expõe a opinião, ouve os demais e busca a melhor solução para o grupo" },
    ],
  },
  {
    n: 3, competency: "team", kind: "self",
    text: "Você prefere trabalhar individualmente ou em equipe? Por quê?",
    options: [
      { text: "Em equipe: juntando ideias, o resultado costuma ser melhor.", points: 3, insight: "se vê rendendo mais em equipe" },
      { text: "Individualmente: assim tenho mais controle sobre o resultado.", points: 1, insight: "prefere trabalhar sozinho para ter controle do resultado" },
      { text: "Tanto faz, me adapto ao que a tarefa pedir.", points: 2, insight: "diz se adaptar ao trabalho individual ou em equipe" },
      { text: "Individualmente: trabalhar com outras pessoas costuma me atrasar.", points: 0, insight: "sente que trabalhar com outras pessoas o atrasa" },
    ],
  },
  // ───── 2. Controle emocional e estresse ─────
  {
    n: 4, competency: "emotional", kind: "situational",
    text: "Quando recebe várias tarefas urgentes ao mesmo tempo, como reage?",
    options: [
      { text: "Começo por várias ao mesmo tempo para adiantar tudo.", points: 1, insight: "tenta tocar várias tarefas urgentes ao mesmo tempo" },
      { text: "Organizo por prioridade e, se não couber no prazo, aviso o responsável.", points: 3, insight: "prioriza as urgências e avisa quando o prazo não comporta tudo" },
      { text: "Fico ansioso, mas faço na ordem em que chegaram.", points: 1, insight: "fica ansioso e segue a ordem de chegada das tarefas" },
      { text: "Faço primeiro as mais rápidas para reduzir a lista.", points: 2, insight: "começa pelas tarefas mais rápidas para reduzir a pressão" },
    ],
  },
  {
    n: 5, competency: "emotional", kind: "situational",
    text: "Como você costuma agir quando recebe uma crítica do seu superior?",
    options: [
      { text: "Explico os motivos do que fiz para mostrar que não foi bem assim.", points: 1, insight: "tende a se justificar ao receber críticas" },
      { text: "Fico chateado, mas não comento e sigo trabalhando.", points: 1, insight: "absorve a crítica em silêncio, mesmo incomodado" },
      { text: "Escuto, peço exemplos se precisar e ajusto o que for necessário.", points: 3, insight: "escuta a crítica, busca entender e ajusta o que for preciso" },
      { text: "Aceito na hora, mesmo sem entender bem o que precisa mudar.", points: 2, insight: "aceita a crítica rapidamente, mesmo sem entender o que mudar" },
    ],
  },
  {
    n: 6, competency: "emotional", kind: "situational",
    text: "Quando um cliente ou colega é grosseiro com você, como reage?",
    options: [
      { text: "Mantenho a calma, sigo educado e, se continuar, chamo um responsável.", points: 3, insight: "mantém a calma diante de grosseria e envolve um responsável se necessário" },
      { text: "Respondo no mesmo tom para me impor.", points: 0, insight: "pode responder no mesmo tom quando tratado com grosseria" },
      { text: "Encerro a conversa o mais rápido possível.", points: 1, insight: "tende a encerrar rapidamente conversas difíceis" },
      { text: "Fico quieto e deixo a pessoa falar até se acalmar.", points: 2, insight: "deixa a pessoa falar até se acalmar" },
    ],
  },
  // ───── 3. Metas e resultados ─────
  {
    n: 7, competency: "goals", kind: "situational",
    text: "Quando percebe que está longe de atingir sua meta, o que faz?",
    options: [
      { text: "Espero o movimento melhorar; meta depende muito do momento.", points: 0, insight: "atribui o resultado da meta principalmente ao momento" },
      { text: "Aumento o ritmo e trabalho mais horas.", points: 2, insight: "responde à meta distante aumentando o esforço e as horas" },
      { text: "Peço ajuda para entender o que os colegas com melhor resultado fazem diferente.", points: 2, insight: "busca aprender com quem tem resultado melhor" },
      { text: "Analiso onde estou perdendo, monto um plano para os próximos dias e acompanho.", points: 3, insight: "analisa onde está perdendo e monta um plano para recuperar a meta" },
    ],
  },
  {
    n: 8, competency: "goals", kind: "situational",
    text: "Como você reage quando recebe uma meta mais alta do que estava acostumado?",
    options: [
      { text: "Vejo como desafio e penso no que preciso mudar para chegar lá.", points: 3, insight: "encara metas mais altas como desafio e planeja como alcançá-las" },
      { text: "Questiono se é possível e peço para revisar o número.", points: 1, insight: "questiona a meta mais alta antes de se comprometer" },
      { text: "Aceito e faço o meu melhor, sem mudar muito a forma de trabalhar.", points: 2, insight: "aceita metas mais altas mantendo a forma de trabalhar" },
      { text: "Fico desmotivado, porque acho injusto.", points: 0, insight: "pode se desmotivar com aumento de meta" },
    ],
  },
  {
    n: 9, competency: "goals", kind: "self",
    text: "O que mais motiva você a alcançar bons resultados?",
    options: [
      { text: "Reconhecimento e possibilidade de crescer na empresa.", points: 3, insight: "é movido por reconhecimento e crescimento" },
      { text: "Satisfação de fazer um trabalho bem feito.", points: 3, insight: "é movido pela satisfação do trabalho bem feito" },
      { text: "Estabilidade e segurança no emprego.", points: 2, insight: "é movido por estabilidade e segurança" },
      { text: "Evitar cobrança da liderança.", points: 1, insight: "é movido principalmente por evitar cobrança" },
    ],
  },
  // ───── 4. Comunicação ─────
  {
    n: 10, competency: "communication", kind: "situational",
    text: "Quando não entende uma orientação, qual é sua atitude?",
    options: [
      { text: "Faço do jeito que acho certo para não incomodar.", points: 0, insight: "pode seguir sem esclarecer orientações que não entendeu" },
      { text: "Pergunto a um colega depois.", points: 2, insight: "esclarece dúvidas com colegas" },
      { text: "Espero ver como os outros fazem e copio.", points: 1, insight: "observa os outros quando não entende uma orientação" },
      { text: "Pergunto na hora e repito com minhas palavras para confirmar que entendi.", points: 3, insight: "esclarece na hora e confirma o entendimento" },
    ],
  },
  {
    n: 11, competency: "communication", kind: "situational",
    text: "Como você lida com pessoas que possuem opiniões muito diferentes das suas?",
    options: [
      { text: "Evito conversar sobre o assunto.", points: 1, insight: "evita conversar quando as opiniões são diferentes" },
      { text: "Escuto com atenção e procuro entender o motivo antes de responder.", points: 3, insight: "escuta e procura entender opiniões diferentes antes de responder" },
      { text: "Tento mostrar por que meu ponto de vista é melhor.", points: 1, insight: "tenta convencer quem pensa diferente" },
      { text: "Respeito, mas mantenho minha opinião sem discutir.", points: 2, insight: "respeita opiniões diferentes sem aprofundar a conversa" },
    ],
  },
  {
    n: 12, competency: "communication", kind: "self",
    text: "Você se considera uma pessoa que consegue expressar suas ideias com clareza?",
    options: [
      { text: "Na maioria das vezes, e quando percebo que não fui claro, explico de outro jeito.", points: 3, insight: "se vê claro e ajusta a explicação quando necessário" },
      { text: "Sim, sempre: as pessoas me entendem de primeira.", points: 2, insight: "se considera sempre claro" },
      { text: "Depende: escrevendo me saio melhor do que falando.", points: 2, insight: "se expressa melhor por escrito" },
      { text: "Tenho dificuldade e prefiro que outra pessoa fale por mim.", points: 1, insight: "relata dificuldade para se expressar" },
    ],
  },
  // ───── 5. Proatividade ─────
  {
    n: 13, competency: "proactivity", kind: "situational",
    text: "Quando termina suas tarefas antes do horário, o que costuma fazer?",
    options: [
      { text: "Pergunto ao líder ou aos colegas em que posso ajudar.", points: 3, insight: "procura em que ajudar quando termina antes" },
      { text: "Aproveito para descansar, já que cumpri minha parte.", points: 0, insight: "considera o trabalho encerrado ao concluir as próprias tarefas" },
      { text: "Reviso o que fiz para ver se ficou tudo certo.", points: 2, insight: "revisa as próprias entregas quando sobra tempo" },
      { text: "Espero alguém me passar uma nova atividade.", points: 1, insight: "aguarda receber nova atividade" },
    ],
  },
  {
    n: 14, competency: "proactivity", kind: "situational",
    text: "Se identificar um problema que ninguém percebeu, como age?",
    options: [
      { text: "Comento com um colega para ver se ele também acha que é um problema.", points: 1, insight: "busca validação de um colega antes de agir sobre um problema" },
      { text: "Não falo nada: se ninguém percebeu, talvez não seja tão importante.", points: 0, insight: "pode deixar de apontar problemas que percebe" },
      { text: "Resolvo o que estiver ao meu alcance e aviso o responsável, sugerindo uma solução.", points: 3, insight: "age no que pode, avisa o responsável e sugere solução" },
      { text: "Aviso o responsável e deixo com ele.", points: 2, insight: "comunica o problema ao responsável" },
    ],
  },
  {
    n: 15, competency: "proactivity", kind: "self",
    text: "Você prefere receber instruções detalhadas ou ter liberdade para encontrar soluções?",
    options: [
      { text: "Instruções detalhadas: me sinto mais seguro.", points: 1, insight: "prefere instruções detalhadas" },
      { text: "Um direcionamento inicial e liberdade para encontrar o caminho.", points: 3, insight: "prefere direcionamento inicial com liberdade para agir" },
      { text: "Total liberdade: não gosto que me digam como fazer.", points: 1, insight: "prefere total liberdade e pode resistir a orientações" },
      { text: "Depende da tarefa: nas novas, prefiro instruções; nas que conheço, liberdade.", points: 2, insight: "ajusta a necessidade de orientação ao tipo de tarefa" },
    ],
  },
  // ───── 6. Responsabilidade e comprometimento ─────
  {
    n: 16, competency: "responsibility", kind: "situational",
    text: "Se cometer um erro que prejudique o resultado da equipe, como reage?",
    options: [
      { text: "Corrijo discretamente, sem comentar.", points: 1, insight: "tende a corrigir erros sem comunicar" },
      { text: "Explico que o erro aconteceu por causa de outra situação.", points: 0, insight: "tende a atribuir os próprios erros a fatores externos" },
      { text: "Fico muito mal e demoro para me recuperar.", points: 1, insight: "se abala bastante com os próprios erros" },
      { text: "Assumo, comunico logo e ajudo a corrigir para não se repetir.", points: 3, insight: "assume o erro, comunica e ajuda a corrigir" },
    ],
  },
  {
    n: 17, competency: "responsibility", kind: "situational",
    text: "Como organiza suas tarefas para cumprir prazos?",
    options: [
      { text: "Vou fazendo conforme as coisas aparecem.", points: 1, insight: "organiza as tarefas conforme aparecem" },
      { text: "Anoto tudo, defino prioridades e confiro o andamento ao longo do dia.", points: 3, insight: "anota, prioriza e acompanha o andamento das tarefas" },
      { text: "Deixo para a reta final, quando rendo mais sob pressão.", points: 0, insight: "costuma deixar as tarefas para a reta final" },
      { text: "Guardo tudo de cabeça; costuma dar certo.", points: 2, insight: "organiza as tarefas de memória" },
    ],
  },
  {
    n: 18, competency: "responsibility", kind: "self",
    text: "O que significa ter comprometimento profissional para você?",
    options: [
      { text: "Cumprir horário e fazer o que foi pedido.", points: 2, insight: "associa comprometimento a cumprir horário e tarefas" },
      { text: "Entregar o combinado com qualidade e cuidar do resultado como se fosse meu.", points: 3, insight: "associa comprometimento a qualidade e senso de dono" },
      { text: "Estar sempre disponível, inclusive fora do horário.", points: 2, insight: "associa comprometimento a disponibilidade total" },
      { text: "Não faltar e não chegar atrasado.", points: 1, insight: "associa comprometimento principalmente a assiduidade" },
    ],
  },
  // ───── 7. Resolução de problemas ─────
  {
    n: 19, competency: "problems", kind: "situational",
    text: "Quando surge um problema inesperado no trabalho, qual é sua primeira reação?",
    options: [
      { text: "Chamo o líder imediatamente.", points: 1, insight: "aciona a liderança como primeira reação" },
      { text: "Tento a primeira solução que vier à cabeça.", points: 1, insight: "age rápido com a primeira solução que encontra" },
      { text: "Entendo o que aconteceu, vejo o que posso resolver e envolvo quem for necessário.", points: 3, insight: "entende o problema antes de agir e envolve quem for necessário" },
      { text: "Busco se já aconteceu antes e como foi resolvido.", points: 2, insight: "busca soluções já usadas em casos parecidos" },
    ],
  },
  {
    n: 20, competency: "problems", kind: "situational",
    text: "Se uma estratégia não estiver funcionando, o que você faz?",
    options: [
      { text: "Continuo, porque mudar no meio do caminho pode piorar.", points: 0, insight: "tende a manter a estratégia mesmo sem resultado" },
      { text: "Analiso o que não está dando certo e testo um ajuste.", points: 3, insight: "analisa o que falhou e testa ajustes" },
      { text: "Troco por outra completamente diferente.", points: 1, insight: "troca de estratégia por completo quando não funciona" },
      { text: "Espero a liderança decidir o que mudar.", points: 1, insight: "aguarda a liderança para mudar a estratégia" },
    ],
  },
  {
    n: 21, competency: "problems", kind: "situational",
    text: "Como reage quando precisa tomar uma decisão difícil?",
    options: [
      { text: "Adio o máximo possível até ter certeza.", points: 0, insight: "tende a adiar decisões difíceis" },
      { text: "Decido rápido, seguindo a intuição.", points: 1, insight: "decide rápido pela intuição" },
      { text: "Peço para outra pessoa decidir.", points: 1, insight: "prefere que outra pessoa decida" },
      { text: "Levanto as informações principais, avalio os riscos e decido no tempo necessário.", points: 3, insight: "avalia informações e riscos e decide no tempo necessário" },
    ],
  },
  // ───── 8. Adaptabilidade e flexibilidade ─────
  {
    n: 22, competency: "adaptability", kind: "situational",
    text: "Como você reage quando a empresa muda processos ou procedimentos?",
    options: [
      { text: "Procuro entender o motivo e me adapto rápido.", points: 3, insight: "busca entender as mudanças e se adapta rápido" },
      { text: "Sigo o novo processo, mas sinto falta do antigo.", points: 2, insight: "segue as mudanças com alguma resistência" },
      { text: "Continuo do jeito antigo até ser cobrado.", points: 0, insight: "pode manter o jeito antigo até ser cobrado" },
      { text: "Questiono se a mudança era realmente necessária.", points: 1, insight: "questiona a necessidade das mudanças" },
    ],
  },
  {
    n: 23, competency: "adaptability", kind: "situational",
    text: "Se precisar aprender uma atividade completamente nova, como se comporta?",
    options: [
      { text: "Fico inseguro e prefiro que outra pessoa faça.", points: 0, insight: "pode evitar atividades novas por insegurança" },
      { text: "Aprendo observando quem já faz.", points: 2, insight: "aprende observando quem já faz" },
      { text: "Busco aprender, pergunto e pratico até pegar o jeito.", points: 3, insight: "busca aprender, pergunta e pratica" },
      { text: "Faço do meu jeito e corrijo se der errado.", points: 1, insight: "aprende por tentativa e erro" },
    ],
  },
  {
    n: 24, competency: "adaptability", kind: "situational",
    text: "Como lida com mudanças de prioridades durante o expediente?",
    options: [
      { text: "Termino o que comecei antes de mudar.", points: 1, insight: "prefere concluir o que começou antes de mudar de prioridade" },
      { text: "Mudo na hora, mesmo deixando algo pela metade.", points: 2, insight: "muda de prioridade na hora" },
      { text: "Reorganizo o que estava fazendo e aviso o que vai atrasar.", points: 3, insight: "reorganiza as tarefas e comunica o impacto da mudança" },
      { text: "Fico irritado, porque atrapalha meu planejamento.", points: 0, insight: "se irrita com mudanças de prioridade" },
    ],
  },
  {
    n: 25, competency: "adaptability", kind: "situational",
    text: "Quando precisa sair da sua zona de conforto profissional, como reage?",
    options: [
      { text: "Vejo como chance de crescer, mesmo sentindo um pouco de receio.", points: 3, insight: "vê sair da zona de conforto como oportunidade de crescer" },
      { text: "Encaro, desde que tenha apoio no começo.", points: 2, insight: "sai da zona de conforto quando tem apoio" },
      { text: "Prefiro continuar no que já domino.", points: 1, insight: "prefere permanecer no que já domina" },
      { text: "Evito sempre que posso.", points: 0, insight: "evita sair da zona de conforto" },
    ],
  },
];

export const BANDS = [
  { min: 80, label: "Forte", tone: "success" },
  { min: 60, label: "Adequado", tone: "brand" },
  { min: 40, label: "Atenção", tone: "warning" },
  { min: 0, label: "Investigar", tone: "danger" },
] as const;

export const bandOf = (score: number) => BANDS.find((b) => score >= b.min)!;

/** Perguntas para a entrevista, por competência (usadas nos pontos de atenção). */
export const INTERVIEW_QUESTIONS: Record<CompetencyKey, string[]> = {
  team: [
    "Conte uma situação em que você ajudou um colega sem que ele pedisse. O que você fez?",
    "Fale de uma vez em que discordou da equipe. Como a situação terminou?",
  ],
  emotional: [
    "Conte um dia de muita pressão no trabalho. Como você organizou as tarefas e como se sentiu?",
    "Descreva um atendimento com um cliente difícil. O que você disse e fez?",
  ],
  goals: [
    "Conte sobre uma meta que você não bateu. O que aprendeu e o que mudou depois?",
    "Qual foi o resultado do qual você mais se orgulha? Como chegou lá?",
  ],
  communication: [
    "Conte uma vez em que uma orientação não ficou clara. O que você fez?",
    "Explique, como se fosse para um cliente, uma tarefa que você fazia no último emprego.",
  ],
  proactivity: [
    "Conte algo que você melhorou no trabalho sem que alguém pedisse.",
    "O que você faz quando percebe um problema que não é da sua área?",
  ],
  responsibility: [
    "Conte um erro que você cometeu no trabalho e como lidou com ele.",
    "Como você organiza o seu dia para não perder prazos? Dê um exemplo recente.",
  ],
  problems: [
    "Conte um problema inesperado que você resolveu. Quais foram os passos?",
    "Fale de uma decisão difícil que você tomou. O que considerou antes de decidir?",
  ],
  adaptability: [
    "Conte uma mudança de processo que você viveu no trabalho. Como se adaptou?",
    "Qual foi a última coisa nova que você aprendeu? Como foi o aprendizado?",
  ],
};
