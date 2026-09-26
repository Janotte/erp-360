/**
 * Seed geográfico inicial: países, estados e cidades.
 *
 * Os JSON ficam ao lado deste arquivo e fora de src/, para não entrar no build da API.
 * Uso: pnpm --filter @erp-360/api db:seed
 */

import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(scriptDir, '..', '.env') });

const { db } = await import('../src/db/index.ts');
const { cities, countries, states } = await import('@erp-360/mod-persons');

const BRAZIL_CODE = '1058';
const BATCH_SIZE = 1000;

interface CountryData {
  id: string;
  code: string;
  name: string;
}

interface StateData {
  id: string;
  code: string;
  name: string;
  abbreviation: string;
  region: string;
}

interface CityData {
  id: string;
  code: string;
  name: string;
  state_id: string;
  is_capital: boolean;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  timezone: string | null;
}

function readJson<T>(fileName: string): T {
  const filePath = join(scriptDir, 'json', fileName);
  console.log(`   📄 Carregando arquivo: ${filePath}`);

  let fileContent = readFileSync(filePath, 'utf-8');
  if (fileContent.charCodeAt(0) === 0xfeff) {
    fileContent = fileContent.slice(1);
  }

  return JSON.parse(fileContent) as T;
}

function toCoordinate(value: number | null): string | null {
  if (value == null) return null;
  return value.toFixed(8);
}

async function seedComplete() {
  console.log('🌱 Iniciando seed completo do sistema...\n');

  console.log('📦 1/3: Inserindo países...');
  const countriesData = readJson<CountryData[]>('countries.json');
  console.log(`   ✅ ${countriesData.length} países carregados do arquivo`);

  const existingCountries = await db.select({ code: countries.code }).from(countries);
  const existingCountryCodes = new Set(existingCountries.map((country) => country.code));

  const countriesToInsert = countriesData.filter(
    (country) => !existingCountryCodes.has(country.code),
  );

  if (countriesToInsert.length > 0) {
    await db.insert(countries).values(
      countriesToInsert.map((country) => ({
        id: country.id,
        code: country.code,
        name: country.name,
      })),
    );
  }

  const countriesSkipped = countriesData.length - countriesToInsert.length;
  console.log(
    `   ✅ ${countriesToInsert.length} países criados, ${countriesSkipped} já existiam\n`,
  );

  console.log('📦 2/3: Inserindo estados brasileiros...');
  const [brazil] = await db
    .select({ id: countries.id })
    .from(countries)
    .where(eq(countries.code, BRAZIL_CODE));

  if (!brazil) {
    throw new Error(`País Brasil (código ${BRAZIL_CODE}) não encontrado`);
  }
  console.log(`   ✅ País Brasil encontrado (ID: ${brazil.id})`);

  const statesData = readJson<StateData[]>('states.json');
  console.log(`   ✅ ${statesData.length} estados carregados do arquivo`);

  const existingStates = await db.select({ code: states.code }).from(states);
  const existingStateCodes = new Set(existingStates.map((state) => state.code));

  const statesToInsert = statesData.filter(
    (state) => !existingStateCodes.has(state.code),
  );

  if (statesToInsert.length > 0) {
    await db.insert(states).values(
      statesToInsert.map((state) => ({
        id: state.id,
        code: state.code,
        name: state.name,
        abbreviation: state.abbreviation,
        region: state.region,
        countryId: brazil.id,
      })),
    );
  }

  const statesSkipped = statesData.length - statesToInsert.length;
  console.log(
    `   ✅ ${statesToInsert.length} estados criados, ${statesSkipped} já existiam\n`,
  );

  console.log('📦 3/3: Inserindo cidades brasileiras...');
  const citiesData = readJson<CityData[]>('cities.json');
  console.log(`   ✅ ${citiesData.length} cidades carregadas do arquivo`);

  const existingCities = await db.select({ code: cities.code }).from(cities);
  const existingCityCodes = new Set(existingCities.map((city) => city.code));

  const allStates = await db.select({ id: states.id, code: states.code }).from(states);
  const stateIdByCode = new Map(allStates.map((state) => [state.code, state.id]));

  let citiesCreated = 0;
  let citiesSkipped = 0;
  let citiesInvalid = 0;
  let batch: Array<typeof cities.$inferInsert> = [];

  async function flushCities() {
    if (batch.length === 0) return;
    await db.insert(cities).values(batch);
    citiesCreated += batch.length;
    console.log(`   📊 Lote: ${batch.length} cidades (Total: ${citiesCreated})`);
    batch = [];
  }

  for (const city of citiesData) {
    if (!city.code || city.code.length !== 7) {
      citiesInvalid++;
      continue;
    }

    if (existingCityCodes.has(city.code)) {
      citiesSkipped++;
      continue;
    }

    const stateId = stateIdByCode.get(city.code.slice(0, 2));
    if (!stateId) {
      citiesInvalid++;
      if (citiesInvalid <= 10) {
        console.log(
          `   ⚠️  Estado com código ${city.code.slice(0, 2)} não encontrado para ${city.name} (${city.code})`,
        );
      }
      continue;
    }

    batch.push({
      id: city.id,
      code: city.code,
      name: city.name,
      stateId,
      is_capital: city.is_capital,
      latitude: toCoordinate(city.latitude),
      longitude: toCoordinate(city.longitude),
      population: city.population,
      timezone: city.timezone,
    });

    if (batch.length >= BATCH_SIZE) {
      await flushCities();
    }
  }

  await flushCities();

  console.log(`   ✅ ${citiesCreated} cidades criadas, ${citiesSkipped} já existiam`);
  if (citiesInvalid > 0) {
    console.log(
      `   ⚠️  ${citiesInvalid} cidades ignoradas (código ou estado inválido)\n`,
    );
  } else {
    console.log();
  }

  console.log('='.repeat(60));
  console.log('🎉 Seed completo finalizado com sucesso!');
  console.log('='.repeat(60));
  console.log('\n📊 Resumo:');
  console.log(
    `   ✅ Países: ${countriesToInsert.length} criados, ${countriesSkipped} já existiam`,
  );
  console.log(
    `   ✅ Estados: ${statesToInsert.length} criados, ${statesSkipped} já existiam`,
  );
  console.log(`   ✅ Cidades: ${citiesCreated} criadas, ${citiesSkipped} já existiam`);
}

try {
  await seedComplete();
  console.log('🏁 Script finalizado.');
  await db.$client.end();
} catch (error) {
  console.error('❌ Erro fatal:', error);
  await db.$client.end().catch(() => undefined);
  process.exit(1);
}
