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
- Clicar em um rótulo abre sua referência e o atalho para Registros. A busca aceita nomes, siglas, KMs e números de SUB. Cada ocorrência tem posição própria, inclusive quando a mesma localidade aparece em mais de um detalhe.
- **Mapa geográfico** oferece camadas independentes para os pontos do KMZ, as SB do KML e as PN do arquivo `Pns.zip`. Todas as camadas e os nomes dos pontos começam desligados; cada uma pode ser ativada ou desativada no painel. Os filtros opcionais de tipo de registro e linha começam em “Todos”.
- Registros possui cinco abas: **Localidades e KMs**, **SUB**, **SB**, **Pontos e cadastros**, **Notas e conexões**. Há busca, paginação, seleção da área do PDF, exportação CSV e navegação até a informação no mapa. Nos cadastros, siglas idênticas às do PDF oferecem atalhos para suas referências na prancha.

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

### Malha geográfica

Os **10.444 pontos** do KMZ original foram restaurados, com os mesmos IDs e coordenadas, para incluir toda a malha. O arquivo não contém linhas ferroviárias; não são criadas ligações artificiais entre seus pontos. Alterações e cadastros da equipe continuam sendo mesclados por ID com os dados do banco.

As **2.025 SB** do arquivo `Ferrovia SB.kml` estão disponíveis integralmente. IDs, coordenadas, KM inicial e final são preservados. As SB aparecem em ciano; a paleta de cada SUB permanece na prancha original. O recorte aproximado anterior da Operação Norte e a associação aproximada aos trechos 00–06 foram substituídos pela cobertura integral solicitada.

As **3.686 PN** foram extraídas dos pontos com `Tipo=PN` e das pastas de PN do KMZ enviado em `Pns.zip`. Linhas, polígonos e pontos de outras pastas não integram essa camada. As coordenadas vêm dos elementos `Point` do KML; nome, KM, município, UF e trecho são mostrados quando presentes na origem. A camada PN aparece em laranja e inicia desligada.

`source_km` preserva literalmente o texto recebido, pois existem valores em escalas diferentes. Os KMs de entrada/saída são preenchidos após validação operacional. Nomes e pontos são desenhados em canvas para evitar milhares de elementos HTML; o renderizador estende o Leaflet 1.9.4 fixado no projeto.

Para reconverter o KMZ: `pwsh scripts/import-kmz.ps1 -InputFile "CAMINHO_DO_KMZ_ZIP"`. Os IDs seguem a ordem original; antes de substituir a fonte, revisar a correspondência dos IDs para preservar os cadastros.

Base de ruas: OpenStreetMap. Base de terreno: Esri World Topographic Map, com atribuições no mapa. As bases dependem de conexão e disponibilidade dos provedores.

## Verificação

`scripts/verify.mjs` testa coordenadas e contagem do KMZ, login, criação de conta, CRUD de ponto, fotos privadas, auditoria e bloqueios de privilégio. Requer `TEST_EMAIL` e `TEST_PASSWORD` via ambiente. Cria um usuário temporário e imprime apenas seu ID para remoção administrativa após a execução. Não salva credenciais.

`python scripts/verify-operation.py [CAMINHO_KML]` verifica offline o hash do PDF, os 1.512 textos contra a fonte, os limites das posições, as 91 SUB, os sete detalhes, os 688 blocos de imagem, a contagem e coordenadas dos pontos e das SB. Com o KML como argumento, compara também todos os IDs, KMs e vértices importados.

A interface da prancha e dos registros foi conferida em navegador local, incluindo busca, navegação entre páginas, SUB, SB, camadas geográficas e tamanho móvel. Os testes dessa mudança não alteram usuários ou dados de produção.

## Publicação

Hospedagem principal: https://erwinklein94.github.io/Mapa/

O workflow `.github/workflows/pages.yml` instala as dependências, compila e publica somente `dist` a cada push na `main`. O GitHub Pages deve usar a origem **GitHub Actions**. Os caminhos dos arquivos são relativos e funcionam no subdiretório `/Mapa/`. O endereço é público, com acesso à aplicação protegido pelo login e pelas permissões do Supabase.

O manifesto da publicação anterior no Sites está em `.openai/hosting.json`; ela é independente do GitHub Pages. O projeto não grava credenciais do Editor no código.

O Supabase sinaliza que a proteção contra senhas vazadas está desativada; pode ser habilitada nas configurações de Auth quando disponível no plano.
