# Mapa de Operações

Aplicação em português para consultar os 10.444 pontos do KMZ da Rumo e cadastrar AMVs, estações, pátios e sedes. Interface com a paleta e fontes do [brandbook Rumo](https://brandbook.rumolog.com/).

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

## Malha

O arquivo original possui somente pontos, sem geometrias LineString. Não foram inventados segmentos entre pontos nem classificações de linha. `source_km` preserva literalmente o texto recebido, pois existem valores em escalas diferentes. Os campos de KM de entrada/saída são preenchidos manualmente após validação operacional. Marcadores têm raio 4px (diâmetro 8px) e tolerância maior para clique. Os nomes aparecem automaticamente ao lado dos pontos, com contorno branco para leitura sobre o mapa. Pontos e nomes são desenhados no mesmo canvas para evitar milhares de elementos HTML; o renderizador estende o Leaflet 1.9.4 fixado no projeto.

Para reconverter o arquivo: `pwsh scripts/import-kmz.ps1 -InputFile "CAMINHO_DO_KMZ_ZIP"`. Os IDs seguem a ordem original; antes de substituir por uma nova malha, revisar correspondência dos IDs para preservar os registros existentes.

Base de ruas: OpenStreetMap. Base de terreno: Esri World Topographic Map, com atribuições no mapa. “Ruas” é cartografia viária, não imagens panorâmicas Street View. As bases dependem de conexão e disponibilidade dos provedores.

## Verificação

`scripts/verify.mjs` testa coordenadas e contagem do KMZ, login, criação de conta, CRUD de ponto, fotos privadas, auditoria e bloqueios de privilégio. Requer `TEST_EMAIL` e `TEST_PASSWORD` via ambiente. Cria um usuário temporário e imprime apenas seu ID para remoção administrativa após a execução. Não salva credenciais.

Validação inicial: todos os testes acima passaram; dados temporários removidos. A automação do navegador não iniciou neste ambiente, portanto a revisão visual automatizada não foi concluída.

## Publicação

Hospedagem principal: https://erwinklein94.github.io/Mapa/

O workflow `.github/workflows/pages.yml` instala as dependências, compila e publica somente `dist` a cada push na `main`. O GitHub Pages deve usar a origem **GitHub Actions**. Os caminhos dos arquivos são relativos e funcionam no subdiretório `/Mapa/`. O endereço é público, com acesso à aplicação protegido pelo login e pelas permissões do Supabase.

O manifesto da publicação anterior no Sites está em `.openai/hosting.json`; ela é independente do GitHub Pages. O projeto não grava credenciais do Editor no código.

O Supabase sinaliza que a proteção contra senhas vazadas está desativada; pode ser habilitada nas configurações de Auth quando disponível no plano.
