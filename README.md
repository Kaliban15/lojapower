# Estrutura Front-End - Power Produtos

Fluxo mobile-first para trafego via QR Code com separacao clara entre Home, Produto e Checkout.

## Paginas

- `index.html`: Home com destaque principal no topo + lista de produtos.
- `produto.html`: Pagina de produto (sem checkout embutido).
- `checkout.html`: Pagina de checkout com formulario, resumo, PIX e upsell.
- `/vendedor`: Painel interno para listar e cadastrar produtos.

## Assets e scripts

- `home.css`: estilos da Home.
- `product.css` e `product.js`: estilos/logica da pagina de produto.
- `checkout.css` e `checkout.js`: estilos/logica da pagina de checkout.
- `server.js`: servidor local (Express) com API e persistencia em arquivo.
- `vendedor/index.html`, `vendedor/vendedor.css`, `vendedor/vendedor.js`: pagina do vendedor.
- `data/products.json`: banco local em arquivo JSON.

## Parametros de URL

- `cupom`: aplica o identificador do cupom. Ex.: `?cupom=CLIENTE30`
- `desconto`: aplica percentual numerico entre 1 e 99. Ex.: `?desconto=30`
- `discount` e `coupon` tambem sao aceitos como alias.

## Como rodar localmente

1. `npm install`
2. `npm start`
3. Acessar:
   - `http://localhost:3000/` (Home)
   - `http://localhost:3000/produto.html` (Produto)
   - `http://localhost:3000/checkout.html` (Checkout)
   - `http://localhost:3000/vendedor` (Painel interno, sem link publico)

## Arquitetura recomendada para producao (alta performance)

1. Empacotador: `Vite` para build estatico e cache busting.
2. Estilo: `Tailwind CSS` compilado localmente (sem CDN em producao) com purge para reduzir CSS final.
3. Critico de renderizacao:
   - Inline apenas CSS critico acima da dobra.
   - `defer`/`module` para JS nao critico.
4. Imagens e icones:
   - SVG para icones e mapas estilizados.
   - `webp/avif` para imagens reais com `srcset`.
5. Observabilidade:
   - Eventos de funil no GA4/Meta Pixel: `view_item`, `add_to_cart`, `begin_checkout`, `generate_pix`, `copy_pix`.
6. Infra:
   - Deploy em CDN edge (Cloudflare Pages, Vercel ou Netlify).
   - Compressao Brotli + cache agressivo para assets versionados.

## Proximos passos de integracao

1. Substituir payload PIX placeholder por integracao real com gateway.
2. Integrar simulacao de frete real por CEP e area de cobertura.
3. Conectar checkout a API de pedidos/CRM para retencao e LTV.
