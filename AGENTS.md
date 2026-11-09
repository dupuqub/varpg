# AGENTS.md

Guia para qualquer agente que continue este projeto. Tudo o que importa para dar continuidade deve estar aqui, não em conversas.

## O que é

Action RPG 2D top-down na linha de Diablo e Path of Exile, que roda no navegador.

Estado do repositório: contém apenas README.md, AGENTS.md e .gitignore. Ainda não há código.

## Conceito

O jogo é uma crítica construtiva aos métodos de alguns jogos. Eixos, em ordem de prioridade:

1. **Respeito ao tempo do jogador.**
2. **Transparência de dados** (contra a obfuscação).
3. **Reprodutibilidade:** uma run deve poder ser repetida de forma idêntica, inclusive para machine learning.

O jogo é sobre **build**: skill tree massiva, mas também testar uma coisa de cada vez. A estrutura do projeto e do processo deve permitir que novas skills apareçam sem grandes problemas, com testes automatizados que garantam que as sinergias funcionam.

### Loop de jogo

Entra num mapa (estilo Vampire Survivors), roda a build, coleta recurso, sai do mapa, melhora a build, próximo mapa.

### Respeito ao tempo (regras de design)

- Mapas de 10 minutos.
- Respec da skill tree sempre gratuito, sem limite.
- O jogador deve sempre poder pivotar de build entre runs.

### Transparência (regras de design)

- Deve existir uma página que mostra detalhadamente como cada dano foi calculado: uma fórmula comentada que diz onde e quando cada buff é aplicado, e em que ordem.
- Não é didática. É auditoria: o jogador precisa ter ciência completa do desempenho real da build, para melhorá-la com eficácia e para dar feedback sobre a lógica do jogo.

## Decisões

### Stack

- JavaScript, HTML e CSS para a UI; canvas 2D para sprites e tiles. O canvas só desenha.
- Máxima simplicidade: sem engine ou biblioteca de jogo. JavaScript puro (o usuário temeu que TypeScript complicasse o projeto).
- Colisão própria e simples: todo actor é um círculo; o cenário usa retângulos.

### Simulação

- **Determinística:** mesmo estado inicial e mesmos inputs produzem uma run idêntica. Uma das metas é reproduzir runs para machine learning.
- **60 steps por ciclo** (1 s no melhor caso). Todos os valores do jogo são baseados em 60 fps.
- A física é calculada uma vez por frame: **um step por frame mostrado**. Steps nunca são pulados e frames não mostrados não são calculados ("calcula e mostra, sempre"). Se a máquina não aguenta 60 fps, o jogo roda em câmera lenta.
- **O estado do jogo é um só, e é um JSON.**
- **Debug de frame:** poder pausar e ter um botão que avança um frame por vez, para entender o que acontece a cada momento.
- **Relatório por frame:** um step é uma coleção ordenada de funções, e a informação entre frames nem sempre mostra *quando* dentro do frame algo aconteceu. Por isso, cada frame gera um relatório com tudo que aconteceu, em ordem. O relatório é um texto simples (txt): cada coisa que acontece vai escrevendo nele. Não haverá ferramentas internas de intra-pause ou intra-play: o debug usa só o play normal e o frame a frame.

### Spawn

- A cada X tempo, Y spawn. Cada mapa tem o que aparece e quando conhecido exatamente.
- A princípio, todos os actors querem atacar o jogador.
- Actor que sai da tela reaparece do lado oposto. Assim há um número limitado de actors sempre presentes, quase todos na tela.
- Sem grade espacial por ora. Se o FPS cair demais, subdividir o ambiente numa grade em relação ao centro (o jogador).

### Fórmula de dano (versão inicial, sem buffs)

```
DAMAGE = max(0, ATTACK - DEFENSE)
HEALTH = HEALTH - DAMAGE
```

- Se DEFENSE >= ATTACK, o dano é 0. Defender nunca cura o alvo.
- O primeiro caso a simular é um golpe sem arma, sem buffs de nenhum tipo.
- ATTACK e DEFENSE ainda não estão definidos (o que são, de onde vêm). Esse é o próximo passo.
- A fórmula será desenvolvida aos poucos, uma peça de cada vez.

### Actor

Actor é qualquer entidade que pode atuar em combate. Inclui armadilhas, que são actors estáticos.

Rascunho do formato (provisório, vai mudar):

```json
{
  "id": "player_1",
  "name": "Jogador",
  "health": { "current": 100, "max": 100 },
  "attack": 10,
  "defense": 3,
  "position": { "x": 0, "y": 0 },
  "is_static": false
}
```

Notas sobre o rascunho: `attack` e `defense` são números soltos porque ainda não foram definidos; não há skills nem buffs porque ainda não existem; `is_static` distingue actor móvel de armadilha e pode ser removido se não fizer sentido.

## Ideias registradas (propostas do agente, não decididas)

Só viram decisão quando o usuário aprovar.

- **Pipeline de dano com etapas registradas:** cada etapa anota o que fez. Serve para a página de auditoria e para testar sinergias.
- **Step como lista de fases nomeadas**, por exemplo: inputs, spawn, movimento, colisão, dano, remover mortos. Nenhuma fase chama outra, e a ordem fica escrita num só lugar.
- **Conteúdo do relatório de frame:** uma linha de texto por acontecimento, na ordem em que acontece, em formato regular e legível. Cada linha traz o número do frame, os actors envolvidos e os valores antes e depois (por exemplo, vida 100 para 93), para dar para reconstruir o estado em qualquer ponto do frame. As linhas de dano trazem o cálculo completo, o que alimenta a página de auditoria do dano. Manter o formato estrito permite ler o relatório por código depois: uma linha por acontecimento (sem quebra de linha), tipo do evento logo no começo, número do frame em toda linha e ids estáveis para os actors, para dar para filtrar com ferramentas de texto como `grep`.
- **Onde o relatório mora:** como um campo do estado, substituído a cada frame (mantém a regra do JSON único). Como a run é determinística, os relatórios antigos podem ser regerados a partir da semente e dos inputs, então não precisam ser guardados.
- **O relatório só é escrito, nunca lido pela simulação.** Um teste pode garantir que o estado final é idêntico com o relatório ligado ou desligado. Se gerar um relatório por frame pesar, isso permite desligá-lo sem alterar a run.
- **O relatório de texto é para humanos e agentes depurarem; para machine learning, a fonte é a coleção de estados (decisão do usuário).** O estado JSON já é estruturado. Proposta do agente: um módulo de exportação separado, que só lê o estado e gera dados numéricos (por exemplo, um CSV com uma linha por actor por frame: frame, id, posição, vida e assim por diante, ou um vetor numérico de tamanho fixo), e que, como o relatório, nunca altera a simulação. Valores que o ML vai querer (dano causado no frame, mortes) devem ser contadores numéricos no estado, em vez de ter de ser extraídos do texto. A definição de recompensa e do formato de observação fica para quando o ML entrar no projeto.
- **Requisitos práticos do determinismo:** gerador pseudoaleatório com semente guardada no estado (`Math.random` não aceita semente); nada de `Date.now` ou `performance.now` dentro da simulação; actors processados sempre em ordem fixa; evitar `Math.sin`, `Math.cos` e `Math.pow` se replays precisarem coincidir entre navegadores diferentes; estado sem `NaN`, `Infinity` ou `undefined` (o JSON não os representa).
- **Limite de ritmo em monitores acima de 60 Hz:** ignorar os chamados do navegador que chegam antes de ~16,7 ms do último frame (sem step e sem desenho), para o jogo não acelerar.
- **Uma run = semente + mapa + inputs por frame.** Um teste pode rodar a mesma run duas vezes e comparar um hash do estado final.
- Salvar o estado em qualquer frame e voltar no tempo recarregando um estado salvo e reaplicando inputs.

## Em aberto

- Definir ATTACK e DEFENSE. Primeiro passo de código sugerido pelo agente: rodar a fórmula num teste simples, sem tela.
- Testes: Node só para testes (`node --test`, sem dependências npm) ou uma página de testes no navegador. O agente não consegue executar páginas no navegador por conta própria, e o usuário questionou a segurança do npm.
- Visual: formas geométricas como placeholder? (sugerido, não confirmado)
- Controles: WASD + mouse, ou clique para mover? (não decidido)
- Estrutura de pastas do projeto (não decidida).

## Como trabalhar neste projeto

- Resolver um problema de cada vez. Respostas curtas.
- Não escrever código nem publicar nada sem o usuário pedir. O usuário explica o conceito e define as decisões; o agente propõe e confirma.
- Não assumir o óbvio: se uma pergunta já tem resposta evidente, decidir e seguir, e reservar perguntas para decisões de design reais.
- Código com foco em legibilidade e transparência: nomes claros, sem esperteza desnecessária.
- Idioma da conversa: português do Brasil. Identificadores no código em inglês.
- Registrar neste arquivo toda decisão nova que afete a direção do projeto.
