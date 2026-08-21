import fs from "node:fs/promises";

const outputPath = "C:/Users/achri/Documents/dataset_supervisionado_300.csv";
const categories = ["alfa", "beta", "gama", "delta", "epsilon", "zeta"];
const categoryWeights = [-1.1, -0.6, -0.15, 0.35, 0.8, 1.2];
let seed = 428_771;

function random() {
  seed = (seed * 16_807) % 2_147_483_647;
  return (seed - 1) / 2_147_483_646;
}

function normal() {
  const left = Math.max(random(), 0.000001);
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * random());
}

function valueOrMissing(value, rate) {
  return random() < rate ? "" : value;
}

const rows = ["a,b,c,d,e,target"];
for (let index = 0; index < 300; index += 1) {
  const categoryIndex = index % categories.length;
  const a = 48 + normal() * 15;
  const c = 0.72 * a + normal() * 12;
  const d = 88 - 0.3 * a + normal() * 11;
  const e = 35 + 0.45 * c - 0.22 * d + normal() * 9;
  const score =
    -5.1 +
    0.065 * a +
    0.035 * c -
    0.025 * d +
    0.05 * e +
    categoryWeights[categoryIndex] +
    normal() * 0.55;
  const probability = 1 / (1 + Math.exp(-score));
  const target = random() < probability ? "aprovado" : "reprovado";
  const values = [
    valueOrMissing(a.toFixed(3), 0.05),
    valueOrMissing(categories[categoryIndex], 0.04),
    valueOrMissing(c.toFixed(3), 0.06),
    valueOrMissing(d.toFixed(3), 0.05),
    valueOrMissing(e.toFixed(3), 0.07),
    valueOrMissing(target, 0.02)
  ];
  rows.push(values.join(","));
}

await fs.writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");
