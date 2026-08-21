# Livro de Regras

Estas regras sao inquebraveis para o projeto Sherlock / Watson Clone. Qualquer implementacao futura deve respeitar este contrato antes de alterar UI, backend, persistencia ou execucao.

## Qualidade de codigo

- Codigo deve ser limpo, otimizado, facil de ler e facil de manter.
- Implementacoes devem seguir boas praticas do ecossistema usado no arquivo alterado.
- Evitar duplicacao, estados desnecessarios, funcoes longas e acoplamento sem necessidade.
- Preferir nomes claros, fluxo explicito e separacao de responsabilidades.
- Toda solucao nova deve ser funcional de verdade; nao adicionar comportamento apenas cosmetico.
- Se o usuario estiver tecnicamente errado, ou se houver um caminho melhor, sugerir antes de seguir o comando.

## Runtime local

- Apenas uma instancia do backend local pode rodar por vez.
- Se o backend ou o launcher do backend for atualizado, reiniciar o backend.
- Nunca deixar dois backends ativos ao mesmo tempo; antes de subir o backend novo, encerrar qualquer listener antigo da porta operacional.
- A porta operacional atual do backend e `8001`; o frontend deve falar com ela pelo proxy do Vite.

## Refine

- Dataset e carregado por completo no backend.
- Qualquer analise em cima do dataset deve ser feita em cima do dataset completo.
- Preview e apenas visualizacao limitada para o usuario; preview nunca define o tamanho real do dataset.
- Transformacoes, qualidade, validacoes, perfis, estatisticas, sugestoes e outputs derivados devem usar a fonte completa no backend.
- O navegador nao deve carregar datasets grandes por inteiro em memoria.
- Nenhum data asset operacional pode ter mais de 500.000 linhas.
- Todo arquivo delimitado aceito deve ser convertido no backend para Parquet usando Polars antes de virar data asset operacional.
- Datasets acima de 500.000 linhas devem ser bloqueados como asset operacional e oferecer criacao de amostra aleatoria de ate 500.000 linhas.
- Depois do upload/migracao, qualquer manuseio de dataset deve usar o Parquet operacional com Polars.

## Visualize

- Node so conhece o que esta conectado a ele.
- Nenhum node pode acessar colunas, dados ou schema que nao venham do seu fluxo conectado.
- Node Python tem multiplas conexoes.
- Cada conexao do node Python e um fluxo diferente.
- Saidas Python sem entrada correspondente devem produzir nulo, sem reutilizar outro fluxo.
- Visualizer deve ser calculado em cima de todos os dados.
- Range e preview limitam apenas o que o usuario ve, nunca o conjunto usado para calcular graficos, agregacoes, estatisticas ou transformacoes.
- Graficos devem ser derivados exclusivamente dos dados conectados ao node, sem dados demonstrativos ou fallback cosmetico.
- Node Python recebe `df` e `inputs` como `pl.DataFrame`; cada entrada deve ser copia/fluxo independente e `result` deve ser `pl.DataFrame`.
