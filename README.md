# Mapa de Operações

Aplicação em português para explorar a prancha completa de operações da Rumo, consultar a malha geográfica e cadastrar AMVs, estações, pátios e sedes. Interface com a paleta e fontes do [brandbook Rumo](https://brandbook.rumolog.com/).

## Desenvolvimento

Node.js 22 ou superior e npm. Execute `npm ci`, `npm run build` e `npm run dev`. A prévia fica em http://127.0.0.1:4173. O diretório `dist` contém a versão estática publicada. Sempre reconstrua após alterações em `src/app.js`.

## Dados e autenticação

Supabase: `rgjdhajnbwmjoqceeypd`. A chave pública no cliente é intencional; autorização é aplicada no banco com RLS. Não colocar senhas ou chaves de serviço no repositório.

- Editor: cria contas e consulta auditoria, além das ações comuns.
- Analista, Fiscal, Especialista e Coordenador: consultam e editam os mesmos registros e fotos.
- Contas criadas fora do fluxo administrativo não têm perfil e não acessam dados.
- “Sair da conta” encerra só a sessão do navegador atual. Se a sessão for encerrada no servidor, o app pede novo login em vez de falhar ao criar contas.
- Fotos ficam em bucket privado e são exibidas com URLs temporárias.
- A página Documentos permite ao Editor enviar e excluir PDFs e planilhas Excel (.xls/.xlsx), até 50 MB por arquivo. Todos os perfis cadastrados podem pesquisar e baixar os documentos; visitantes sem login não têm acesso. Arquivos ficam no bucket privado `documents`, fora do GitHub. As políticas estão em `supabase/documents.sql`.
- A biblioteca inicial contém os 13 PDFs e a planilha fornecidos pelo usuário. A importação em `scripts/import-documents.mjs` recebe o diretório dos arquivos e credenciais via ambiente, e verifica cada download por SHA-256 sem alterar o conteúdo. Downloads feitos pelos perfis comuns são registrados na auditoria.
- Auditoria de alterações é produzida por triggers, com dados anteriores e posteriores; navegação é registrada pelo cliente. Não é um registro de telemetria inviolável de todas as leituras da API.
- O SQL em `supabase/schema.sql` documenta o esquema instalado. A função `manage-users.ts` é publicada no Supabase com verificação JWT e validação adicional do Editor no servidor.

## Interface

- O botão de menu (☰) no topo recolhe a barra lateral para uma coluna só de ícones. A escolha fica salva no navegador.
- Na página Mapa, "Modo Apresentação" coloca a página em tela cheia e esconde a barra lateral, o topo e o painel de camadas, que abre pelo botão "Camadas". Para sair, use "Sair da apresentação" ou Esc.
- O botão de sol/lua alterna entre tema claro e escuro. A página sempre abre no tema claro. No tema escuro, a base "Ruas" é escurecida por filtro CSS.
- A página Mapa abre na **Prancha interativa**, sem seleção de SUB, tipo de registro ou tipo de linha. A prancha mantém as cores, símbolos, limites, conexões, setas e notas do PDF original. Zoom, arraste, busca, seleção de SUB e sete atalhos de detalhes permitem navegar pelo documento.
- O seletor **Documento** alterna entre a prancha de dezembro/2023 e a prancha histórica Rumo/ALL de junho/2015. Documento, SUB, detalhe e destaque dos rótulos usam seletores padronizados. A busca aceita nomes, siglas, KMs e números de SUB, inclusive os KMs anexos à caixa de uma estação.
- Clicar em um rótulo, ponto, PN, estação ou SB abre a **Consulta integrada**. O modal reúne dados do local, KMs, informações próximas por distância, referências das duas pranchas, coordenadas e links para o Google Maps. O raio varia de 250 m a 10 km; é possível consultar as camadas selecionadas no mapa ou todas as informações. Para segmentos SB, usa a menor distância até o traçado. Os resultados têm paginação e detalhes expansíveis.
- Na prancha, a localização é vinculada por sigla exata a uma estação georreferenciada ou a um ponto do KMZ. Rótulos ambíguos e SUB oferecem escolhas de locais. Anotações sem localização verificada continuam consultáveis, com a fonte original, sem coordenada ou link inventado. As posições gráficas da prancha não são usadas como latitude/longitude. O mapa geográfico também permite consultar uma coordenada livre, clicando no fundo fora do modo de adicionar ponto.
- **Mapa geográfico** oferece camadas independentes para os pontos do KMZ, as SB do KML, as PN do arquivo `Pns.zip` e as estações do PDF de 2015. Todas começam desligadas. Malha, tipo de registro, tipo de linha, camadas, nomes e base cartográfica usam o mesmo padrão de seletor no painel. O filtro de malha permite escolher Norte, Oeste, Paulista, Sul ou Central: ao selecionar uma, as quatro camadas são ativadas e só aparecem os elementos atribuídos à concessão escolhida. A busca e o enquadramento seguem a mesma escolha.
- Registros possui sete abas: **Localidades e KMs**, **SUB**, **SB**, **Pontos e cadastros**, **Passagens de nível**, **Estações** e **Notas e conexões**. Há busca, seletores de fonte/data, categoria e área, paginação, exportação CSV de todos os resultados filtrados e navegação para o mapa ou para o mesmo modal de consulta. As estações sem coordenadas permanecem nesta tabela. A edição de cadastros e fotos continua acessível pelo modal e pela aba de pontos.
- As camadas geográficas iniciam desligadas a cada abertura do site. Durante a sessão, as escolhas de malha, camadas e base são preservadas ao navegar entre mapas, modal e registros.

## Fontes e cobertura

### Prancha de operação

`MAPA_OPERAÇÃO.pdf`, fornecido pelo usuário, contém uma página A0. O carimbo informa **Base SIV, atualizada em DEZ-2023**; essa data aparece no site e não representa uma atualização operacional em tempo real.

O catálogo preserva **1.512 objetos de texto**, sem eliminar repetições: 903 localidades com siglas, 276 quilometragens, 122 conexões, 90 notas e referências, 15 títulos de detalhes e 106 ocorrências numéricas de SUB, correspondentes a **91 números distintos**. A classificação serve à consulta; o texto original e sua posição permanecem disponíveis.

A imagem integral é servida em 688 blocos PNG, com três níveis de resolução e ampliação de até quatro vezes a escala PDF. Isso preserva também informações gráficas que não são objetos de texto. Os sete quadros de detalhe são Santos; Iperó/Amador Bueno/Canguera/Salto; Campinas; Araraquara; SUB 76 Iperó–Rubião Junior; Anápolis; e SUB 78 Bauru–Itirapina.

O PDF original completo e o catálogo JSON podem ser baixados pelo site. O SHA-256 da fonte está no catálogo. A prancha é um **desenho esquemático**: as cores e divisões de SUB são consultadas nela. Não são atribuídas coordenadas geográficas, SUB ou operações aos pontos por proximidade visual. A classificação geográfica por operação/SUB exige correspondência operacional validada.

Para reproduzir a importação (Python com `pypdfium2` e `Pillow`):

```powershell
python scripts/import-operation.py "CAMINHO_DO_MAPA_OPERAÇÃO.pdf" "CAMINHO_DO_Ferrovia SB.kml"
python scripts/verify-operation.py "CAMINHO_DO_Ferrovia SB.kml"
npm run build
```

### Prancha histórica Rumo / ALL 2015

O documento `Mapa Rumo_ALL_2015-52X74cm.pdf` tem uma prancha com atualização SIV em **26/06/2015** e a observação **Mapa em revisão**. Foi incorporado como fonte histórica; suas diferenças não substituem automaticamente o cadastro nem os dados de 2023.

O catálogo em `dist/assets/operation-2015` preserva **1.421 objetos de texto**, **664 siglas**, **80 números de SUB**, cinco quadros de detalhe e a imagem integral em 688 blocos PNG. Inclui 898 objetos de localidades/KMs, 242 quilometragens, 120 conexões, 65 notas, dez títulos de detalhe e 86 ocorrências de SUB. Em comparação às siglas do catálogo de 2023, há três adicionais: **TPD** (Pátio de Dormentes), **TPO** (Term. da Ponte) e **ZSP** (S. José do Rio Preto).

Foram recuperados os mapas de caracteres de quatro fontes incorporadas para extrair corretamente acentos e setas, sem alterar o PDF servido. As linhas imediatamente abaixo e alinhadas ao título de uma estação são preservadas também em `contextText`, com os KMs por sentido e os IDs dos textos de origem; as linhas associadas guardam `anchorCodes`. Todos os textos originais continuam como registros separados e clicáveis. O PDF, o hash de origem e a data ficam disponíveis para conferência.

Para reproduzir (Python com `pypdfium2`, `Pillow` e `pypdf`):

```powershell
python scripts/import-rumo-2015.py "CAMINHO_DO_Mapa Rumo_ALL_2015-52X74cm.pdf"
python scripts/verify-rumo-2015.py
```

### Malha geográfica

Os **10.444 pontos** do KMZ original foram restaurados, com os mesmos IDs e coordenadas, para incluir toda a malha. O arquivo não contém linhas ferroviárias; não são criadas ligações artificiais entre seus pontos. Alterações e cadastros da equipe continuam sendo mesclados por ID com os dados do banco.

As **2.025 SB** do arquivo `Ferrovia SB.kml` estão disponíveis integralmente. IDs, coordenadas, KM inicial e final são preservados. As SB aparecem em ciano; a paleta de cada SUB permanece na prancha original. O recorte aproximado anterior da Operação Norte e a associação aproximada aos trechos 00–06 foram substituídos pela cobertura integral solicitada.

As **3.686 PN** foram extraídas dos pontos com `Tipo=PN` e das pastas de PN do KMZ enviado em `Pns.zip`. Linhas, polígonos e pontos de outras pastas não integram essa camada. As coordenadas vêm dos elementos `Point` do KML; nome, KM, município, UF e trecho são mostrados quando presentes na origem. A camada PN aparece em laranja e inicia desligada.

O PDF `ESTAÇÕES 2015.pdf` contém **818 linhas SIV de julho/2015** para **671 siglas de estação**, com nome, KM médio, KM de entrada, KM de saída e SUB. Registros repetidos por sigla são preservados no popup. O PDF não possui coordenadas: **617 estações** foram localizadas pela sigla no KMZ ou nos pátios terminais da base Infra S.A.; as **54 restantes** ficam preservadas em `dist/assets/rail-stations.json`, sem marcador geográfico inventado. A camada de estações aparece em roxo e inicia desligada. Para reconverter: `python scripts/import-stations.py "CAMINHO_DO_PDF"` (requer `pypdfium2` e o arquivo `rail-malhas.json` atualizado).

O PDF `02-MALHAS.pdf`, fornecido pelo usuário, identifica quatro malhas por cor (Norte, Oeste, Paulista e Sul), mas é esquemático e não contém coordenadas dos limites. Para atribuir pontos, AMVs cadastrados, PN e SB a uma malha no mapa geográfico, o site usa os traçados vetoriais das concessões da [Infra S.A. / ANTT (Declaração de Rede 2024)](https://geo.infrasa.gov.br/server/rest/services/Hosted/Concess%C3%B5es_ferrovi%C3%A1rias_em_Opera%C3%A7%C3%A3o/FeatureServer/13), incluindo a Malha Central presente nos dados atuais e ausente no PDF. Cada objeto é associado ao traçado de concessão mais próximo até 2 km; trechos SB usam a classificação predominante dos vértices e pontos médios. Objetos sem correspondência permanecem visíveis em “Todas as malhas” e não são forçados para uma malha por estado ou município. O arquivo local compacto `dist/assets/rail-malhas.json` é gerado por `node scripts/import-malhas.mjs`.

`source_km` preserva literalmente o texto recebido, pois existem valores em escalas diferentes. Os KMs de entrada/saída são preenchidos após validação operacional. Nomes e pontos são desenhados em canvas para evitar milhares de elementos HTML; o renderizador estende o Leaflet 1.9.4 fixado no projeto.

Para reconverter o KMZ: `pwsh scripts/import-kmz.ps1 -InputFile "CAMINHO_DO_KMZ_ZIP"`. Os IDs seguem a ordem original; antes de substituir a fonte, revisar a correspondência dos IDs para preservar os cadastros.

Base de ruas: OpenStreetMap. Base de terreno: Esri World Topographic Map, com atribuições no mapa. As bases dependem de conexão e disponibilidade dos provedores.

## Verificação

`node scripts/verify-location-context.mjs` verifica associações por sigla, ambiguidades, raio, filtros de camadas/malhas, distância ao interior das SB e ausência de coordenadas inventadas. `node scripts/verify-records.mjs` verifica consulta entre fontes, PN, estações sem localização e exportação dos 818 registros SIV. `python scripts/verify-rumo-2015.py` compara textos recuperados e amostras dos blocos de imagem com o PDF original.

`node scripts/verify-map-ui.mjs` executa a integração em navegador local usando os módulos reais e uma página temporária, sem acessar autenticação ou banco. Requer Playwright disponível por módulo ou `MAPA_PLAYWRIGHT_PATH` e Edge no Windows (Chromium nos demais sistemas). Verifica seleção de fonte, cliques PN/SB, modal, raio, filtros preservados, registros, ambiguidades, coordenadas ausentes e layout móvel. Capturas ficam em `.tmp/map-ui` e não são publicadas.

`scripts/verify.mjs` testa coordenadas e contagem do KMZ, login, criação de conta, CRUD de ponto, fotos privadas, auditoria e bloqueios de privilégio. Requer `TEST_EMAIL` e `TEST_PASSWORD` via ambiente. Cria um usuário temporário e imprime apenas seu ID para remoção administrativa após a execução. Não salva credenciais.

`python scripts/verify-operation.py [CAMINHO_KML]` verifica offline o hash do PDF, os 1.512 textos contra a fonte, os limites das posições, as 91 SUB, os sete detalhes, os 688 blocos de imagem, a contagem e coordenadas dos pontos e das SB. Com o KML como argumento, compara também todos os IDs, KMs e vértices importados.

A interface da prancha e dos registros foi conferida em navegador local, incluindo busca, navegação entre páginas, SUB, SB, camadas geográficas e tamanho móvel. Os testes dessa mudança não alteram usuários ou dados de produção.

## Publicação

Hospedagem principal: https://erwinklein94.github.io/Mapa/

O workflow `.github/workflows/pages.yml` instala as dependências, compila e publica somente `dist` a cada push na `main`. O GitHub Pages deve usar a origem **GitHub Actions**. Os caminhos dos arquivos são relativos e funcionam no subdiretório `/Mapa/`. O endereço é público, com acesso à aplicação protegido pelo login e pelas permissões do Supabase.

O manifesto da publicação anterior no Sites está em `.openai/hosting.json`; ela é independente do GitHub Pages. O projeto não grava credenciais do Editor no código.

O Supabase sinaliza que a proteção contra senhas vazadas está desativada; pode ser habilitada nas configurações de Auth quando disponível no plano.
