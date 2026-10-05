# Mapa de Operações

Aplicação em português para consultar os 10.444 pontos do KMZ da Rumo e cadastrar AMVs, estações, pátios e sedes. Interface com a paleta e fontes do [brandbook Rumo](https://brandbook.rumolog.com/).

## Desenvolvimento

Node.js 22 ou superior e npm. Execute `npm ci`, `npm run build` e `npm run dev`. A prévia fica em http://127.0.0.1:4173. O diretório `dist` contém a versão estática publicada. Sempre reconstrua após alterações em `src/app.js`.

## Dados e autenticação

Supabase: `rgjdhajnbwmjoqceeypd`. A chave pública no cliente é intencional; autorização é aplicada no banco com RLS. Não colocar senhas ou chaves de serviço no repositório.

- Editor: cria contas e consulta auditoria, além das ações comuns.
- Analista, Fiscal, Especialista e Coordenador: consultam e editam os mesmos registros e fotos.
- Contas criadas fora do fluxo administrativo não têm perfil e não acessam dados.
- Fotos ficam em bucket privado e são exibidas com URLs temporárias.
- Auditoria de alterações é produzida por triggers, com dados anteriores e posteriores; navegação é registrada pelo cliente. Não é um registro de telemetria inviolável de todas as leituras da API.
- O SQL em `supabase/schema.sql` documenta o esquema instalado. A função `manage-users.ts` é publicada no Supabase com verificação JWT e validação adicional do Editor no servidor.

## Malha

O arquivo original possui somente pontos, sem geometrias LineString. Não foram inventados segmentos entre pontos nem classificações de linha. `source_km` preserva literalmente o texto recebido, pois existem valores em escalas diferentes. Os campos de KM de entrada/saída são preenchidos manualmente após validação operacional. Marcadores têm raio 2px (diâmetro 4px) e tolerância maior para clique.

Para reconverter o arquivo: `pwsh scripts/import-kmz.ps1 -InputFile "CAMINHO_DO_KMZ_ZIP"`. Os IDs seguem a ordem original; antes de substituir por uma nova malha, revisar correspondência dos IDs para preservar os registros existentes.

Base de ruas: OpenStreetMap. Base de terreno: Esri World Topographic Map, com atribuições no mapa. “Ruas” é cartografia viária, não imagens panorâmicas Street View. As bases dependem de conexão e disponibilidade dos provedores.

## Verificação

`scripts/verify.mjs` testa coordenadas e contagem do KMZ, login, criação de conta, CRUD de ponto, fotos privadas, auditoria e bloqueios de privilégio. Requer `TEST_EMAIL` e `TEST_PASSWORD` via ambiente. Cria um usuário temporário e imprime apenas seu ID para remoção administrativa após a execução. Não salva credenciais.

Validação inicial: todos os testes acima passaram; dados temporários removidos. A automação do navegador não iniciou neste ambiente, portanto a revisão visual automatizada não foi concluída.

## Publicação

Manifesto do Sites em `.openai/hosting.json`. Publicação inicialmente privada, conforme o padrão da plataforma; para acesso de outras pessoas, ajustar o compartilhamento da hospedagem. O login e as regras do Supabase continuam obrigatórios. O projeto não grava credenciais do Editor no código.

O Supabase sinaliza que a proteção contra senhas vazadas está desativada; pode ser habilitada nas configurações de Auth quando disponível no plano.
