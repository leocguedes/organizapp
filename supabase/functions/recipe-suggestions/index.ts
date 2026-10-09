import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_PUBLISHABLE_KEY = "sb_publishable_YjvZDDh2CPsaSShoippJ9g_1ccsuj-F";
const ALLOWED_ORIGINS = new Set([
  "https://leocguedes.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const API_BASE = "https://www.themealdb.com/api/json/v1";
const API_KEY = Deno.env.get("THEMEALDB_API_KEY") || "1";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const ingredientSearchMap: Array<{ terms: string[]; api: string }> = [
  { terms: ["peito de frango", "frango"], api: "chicken_breast" },
  { terms: ["carne moida", "carne bovina", "carne de boi", "beef"], api: "beef" },
  { terms: ["carne de porco", "porco", "pork"], api: "pork" },
  { terms: ["ovo", "ovos", "egg"], api: "egg" },
  { terms: ["leite", "milk"], api: "milk" },
  { terms: ["queijo", "mussarela", "muçarela", "cheddar", "cheese"], api: "cheese" },
  { terms: ["arroz", "rice"], api: "rice" },
  { terms: ["batata", "potato"], api: "potato" },
  { terms: ["cenoura", "carrot"], api: "carrot" },
  { terms: ["tomate", "tomato"], api: "tomato" },
  { terms: ["cebola", "onion"], api: "onion" },
  { terms: ["alho", "garlic"], api: "garlic" },
  { terms: ["macarrao", "massa", "espaguete", "penne", "pasta"], api: "pasta" },
  { terms: ["salmao", "salmon"], api: "salmon" },
  { terms: ["atum", "tuna"], api: "tuna" },
  { terms: ["pao", "bread"], api: "bread" },
  { terms: ["manteiga", "butter"], api: "butter" },
  { terms: ["farinha", "farinha de trigo", "flour"], api: "flour" },
  { terms: ["banana"], api: "banana" },
  { terms: ["aveia", "oats", "oat"], api: "oats" },
  { terms: ["iogurte", "yogurt", "yoghurt"], api: "yogurt" },
  { terms: ["limao", "lemon"], api: "lemon" },
  { terms: ["cogumelo", "champignon", "mushroom"], api: "mushroom" },
  { terms: ["camarao", "shrimp"], api: "shrimp" },
  { terms: ["brocolis", "broccoli"], api: "broccoli" },
  { terms: ["espinafre", "spinach"], api: "spinach" },
  { terms: ["maca", "apple"], api: "apple" },
  { terms: ["milho", "corn"], api: "corn" },
];

const ingredientTranslations: Record<string, { name: string; aliases: string[] }> = {
  "chicken": { name: "Frango", aliases: ["chicken", "chicken breast", "frango", "peito de frango"] },
  "chicken breast": { name: "Frango", aliases: ["chicken", "chicken breast", "frango", "peito de frango"] },
  "beef": { name: "Carne bovina", aliases: ["beef", "carne", "carne bovina", "carne de boi"] },
  "pork": { name: "Carne de porco", aliases: ["pork", "porco", "carne de porco"] },
  "egg": { name: "Ovos", aliases: ["egg", "eggs", "ovo", "ovos"] },
  "eggs": { name: "Ovos", aliases: ["egg", "eggs", "ovo", "ovos"] },
  "milk": { name: "Leite", aliases: ["milk", "leite"] },
  "cheese": { name: "Queijo", aliases: ["cheese", "queijo", "mussarela", "muçarela", "cheddar"] },
  "rice": { name: "Arroz", aliases: ["rice", "arroz"] },
  "potato": { name: "Batata", aliases: ["potato", "potatoes", "batata", "batatas"] },
  "potatoes": { name: "Batata", aliases: ["potato", "potatoes", "batata", "batatas"] },
  "carrot": { name: "Cenoura", aliases: ["carrot", "carrots", "cenoura", "cenouras"] },
  "carrots": { name: "Cenoura", aliases: ["carrot", "carrots", "cenoura", "cenouras"] },
  "tomato": { name: "Tomate", aliases: ["tomato", "tomatoes", "tomate", "tomates"] },
  "tomatoes": { name: "Tomate", aliases: ["tomato", "tomatoes", "tomate", "tomates"] },
  "onion": { name: "Cebola", aliases: ["onion", "onions", "cebola", "cebolas"] },
  "onions": { name: "Cebola", aliases: ["onion", "onions", "cebola", "cebolas"] },
  "garlic": { name: "Alho", aliases: ["garlic", "alho", "dente de alho", "dentes de alho"] },
  "pasta": { name: "Macarrão", aliases: ["pasta", "spaghetti", "penne", "macarrão", "massa", "espaguete"] },
  "spaghetti": { name: "Macarrão", aliases: ["pasta", "spaghetti", "macarrão", "massa", "espaguete"] },
  "salmon": { name: "Salmão", aliases: ["salmon", "salmão"] },
  "tuna": { name: "Atum", aliases: ["tuna", "atum"] },
  "bread": { name: "Pão", aliases: ["bread", "pão"] },
  "butter": { name: "Manteiga", aliases: ["butter", "manteiga"] },
  "flour": { name: "Farinha de trigo", aliases: ["flour", "wheat flour", "farinha", "farinha de trigo"] },
  "banana": { name: "Banana", aliases: ["banana", "bananas"] },
  "oats": { name: "Aveia", aliases: ["oats", "oat", "oatmeal", "aveia"] },
  "oatmeal": { name: "Aveia", aliases: ["oats", "oatmeal", "aveia"] },
  "yogurt": { name: "Iogurte", aliases: ["yogurt", "yoghurt", "iogurte"] },
  "yoghurt": { name: "Iogurte", aliases: ["yogurt", "yoghurt", "iogurte"] },
  "lemon": { name: "Limão", aliases: ["lemon", "lime", "limão"] },
  "lime": { name: "Limão", aliases: ["lemon", "lime", "limão"] },
  "mushrooms": { name: "Cogumelos", aliases: ["mushroom", "mushrooms", "cogumelo", "cogumelos", "champignon"] },
  "mushroom": { name: "Cogumelos", aliases: ["mushroom", "mushrooms", "cogumelo", "cogumelos", "champignon"] },
  "shrimp": { name: "Camarão", aliases: ["shrimp", "prawn", "camarão"] },
  "broccoli": { name: "Brócolis", aliases: ["broccoli", "brócolis"] },
  "spinach": { name: "Espinafre", aliases: ["spinach", "espinafre"] },
  "apple": { name: "Maçã", aliases: ["apple", "apples", "maçã", "maçãs"] },
  "apples": { name: "Maçã", aliases: ["apple", "apples", "maçã", "maçãs"] },
  "corn": { name: "Milho", aliases: ["corn", "sweetcorn", "milho"] },
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function mapSearchIngredient(raw: string): string | null {
  const value = normalize(raw);
  const match = ingredientSearchMap.find((entry) =>
    entry.terms.some((term) => value === normalize(term) || value.includes(normalize(term)))
  );
  return match?.api ?? null;
}

function translatedIngredient(raw: string) {
  const key = normalize(raw);
  const translation = ingredientTranslations[key];
  if (translation) return translation;
  return {
    name: raw.split(/\s+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" "),
    aliases: [raw],
  };
}

async function fetchMealDb(path: string) {
  const response = await fetch(`${API_BASE}/${API_KEY}/${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`TheMealDB returned ${response.status}`);
  return await response.json();
}

function parseMeal(meal: Record<string, unknown>) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const rawName = String(meal[`strIngredient${i}`] ?? "").trim();
    if (!rawName) continue;
    const measureText = String(meal[`strMeasure${i}`] ?? "").trim();
    const translated = translatedIngredient(rawName);
    ingredients.push({
      name: translated.name,
      aliases: [...new Set([...translated.aliases, rawName])],
      quantity: 1,
      unit: "unidades",
      ...(measureText ? { measureText } : {}),
    });
  }
  const rawInstructions = String(meal.strInstructions ?? "").replace(/\r/g, "").trim();
  const instructions = rawInstructions
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((step) => step.trim())
    .filter(Boolean);
  const id = String(meal.idMeal ?? "");
  return {
    id: `themealdb-${id}`,
    name: String(meal.strMeal ?? "Receita internacional"),
    description: "Receita externa; ingredientes e modo de preparo podem estar no idioma original.",
    minutes: 0,
    servings: 0,
    ingredients,
    instructions,
    source: "themealdb",
    sourceUrl: `https://www.themealdb.com/meal/${id}`,
    imageUrl: String(meal.strMealThumb ?? ""),
    presenceOnly: true,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
  // This is a read-only proxy for public recipe data; require the app's public API key
  // and an allowed browser origin. No user data or service-role credentials are accessed.
  if (req.headers.get("apikey") !== APP_PUBLISHABLE_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  let body: { ingredients?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }
  const input = Array.isArray(body.ingredients)
    ? body.ingredients.filter((item): item is string => typeof item === "string").slice(0, 40)
    : [];
  const searchIngredients = [...new Set(input.map(mapSearchIngredient).filter((value): value is string => Boolean(value)))].slice(0, 3);
  if (!searchIngredients.length) return jsonResponse({ recipes: [] }, 200, origin);

  const candidateScores = new Map<string, { meal: Record<string, unknown>; score: number }>();
  for (const ingredient of searchIngredients) {
    try {
      const result = await fetchMealDb(`filter.php?i=${encodeURIComponent(ingredient)}`);
      const meals = Array.isArray(result.meals) ? result.meals as Record<string, unknown>[] : [];
      for (const meal of meals) {
        const id = String(meal.idMeal ?? "");
        if (!id) continue;
        const current = candidateScores.get(id);
        candidateScores.set(id, { meal, score: (current?.score ?? 0) + 1 });
      }
    } catch {
      // Continue with the ingredients that responded successfully.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const candidates = [...candidateScores.entries()]
    .sort((a, b) => b[1].score - a[1].score || String(a[1].meal.strMeal ?? "").localeCompare(String(b[1].meal.strMeal ?? "")))
    .slice(0, 6);
  const recipes = [];
  for (const [id] of candidates) {
    try {
      const result = await fetchMealDb(`lookup.php?i=${encodeURIComponent(id)}`);
      const meal = Array.isArray(result.meals) ? result.meals[0] as Record<string, unknown> | undefined : undefined;
      if (meal) {
        const parsed = parseMeal(meal);
        if (parsed.ingredients.length) recipes.push(parsed);
      }
    } catch {
      // Skip a meal that could not be loaded.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return jsonResponse({ recipes }, 200, origin);
});
