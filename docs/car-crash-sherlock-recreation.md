# Recriacao do estudo Car Crash Research no Sherlock

## Acoes executadas

1. Li o notebook original em `C:\Users\achri\OneDrive\DATA SCIENCE\Car-Crash-Research\main.ipynb`.
2. Identifiquei o CSV usado no estudo: `demostrativo_acidentes_aco.csv`.
3. Recarreguei o CSV com separador `;`, preservando o dataset completo no backend.
4. Apliquei as limpezas do notebook: `drop_nulls`, normalizacao de `tipo_de_ocorrencia`, filtro de residuos com `ac`, conversao de `data`, conversao de `km`, normalizacao de `sentido` e criacao de `ano`, `mes`, `mes_nome`, `hora_minuto` e `km_arredondado`.
5. Gravei o dataset refinado em Parquet como `dataset-car-crash-study-refined`.
6. Criei assets seedados para workspace, data asset bruto, data asset refinado, fluxo de visualizacao e notebook visual.
7. Recriei visualizacoes principais no Data Visualizer e no notebook.

## Resultado

- Linhas no CSV original: 12581
- Linhas depois da limpeza: 11689
- Colunas depois da limpeza: 28
- Ocorrencias por tipo: [{'tipo_de_ocorrencia': 'com vitima', 'count': 6383}, {'tipo_de_ocorrencia': 'sem vitima', 'count': 5306}]
- Anos analisados: 2010 a 2023

## Visualizacoes recriadas

- Pizza: sem vitima x com vitima.
- Boxplot: `km`.
- Boxplot: `n_da_ocorrencia`.
- Boxplot: `hora_minuto`.
- Linha: acidentes por ano.
- Barras agrupadas: meses de 2010 a 2014.
- Barras agrupadas: acidentes por `km_arredondado` e `sentido`.
- Barras empilhadas: 2017 por `km_arredondado` e `tipo_de_acidente`.

## Dificuldades anotadas

- O notebook original usa acentos em categorias, mas o projeto evita depender de normalizacao textual instavel. Mantive `com vitima` e `sem vitima` sem acento no asset refinado para evitar divergencias de encoding.
- O estudo original mistura limpeza, analise e graficos em celulas soltas. No Sherlock isso foi separado em data asset refinado, fluxo visual e notebook visual.
- O app ainda nao tem todos os controles interativos do Plotly original, entao recriei as visualizacoes como snapshots funcionais do Data Visualizer.
- Nao havia uma branch git anterior normal para checkout seguro; mantive a implementacao atual e preservei o salvamento de asset por node de tabela.
