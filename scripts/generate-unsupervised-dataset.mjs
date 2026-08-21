import fs from "node:fs/promises";

const outputPath = "C:/Users/achri/Documents/dataset_nao_supervisionado_300.csv";
const categories = ["alfa", "beta", "gama", "delta", "epsilon", "zeta"];
let seed = 731_947;

function random() {
  seed = (seed * 16_807) % 2_147_483_647;
  return (seed - 1) / 2_147_483_646;
}

function normal() {
  const left = Math.max(random(), 0.000001);
  const right = random();
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
}

function missing(rate) {
  return random() < rate ? "" : null;
}

const rows = ["a,b,c,d,e,target"];
for (let index = 0; index < 300; index += 1) {
  const group = index % 3;
  const category = categories[(Math.floor(index / 3) + group * 2) % categories.length];
  const categoryEffect = categories.indexOf(category) - 2.5;
  const a = group * 22 + normal() * 4 + categoryEffect;
  const c = group * -15 + a * 0.7 + normal() * 5;
  const d = 55 + group * 18 + c * 0.35 + normal() * 6;
  const e = 120 - group * 20 + a * 1.1 + normal() * 8;
  const target = group === 0 ? "grupo_azul" : group === 1 ? "grupo_verde" : "grupo_laranja";
  const values = [
    missing(0.05) ?? a.toFixed(3),
    missing(0.04) ?? category,
    missing(0.07) ?? c.toFixed(3),
    missing(0.06) ?? d.toFixed(3),
    missing(0.05) ?? e.toFixed(3),
    missing(0.03) ?? target
  ];
  rows.push(values.join(","));
}

await fs.writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");
