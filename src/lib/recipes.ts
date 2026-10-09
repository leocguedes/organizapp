import type {Unit} from './domain';

export type RecipeIngredient = {
  name: string;
  aliases: string[];
  quantity: number;
  unit: Unit;
  measureText?: string;
};

export type Recipe = {
  id: string;
  name: string;
  description: string;
  minutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  source?: 'themealdb';
  sourceUrl?: string;
  imageUrl?: string;
  presenceOnly?: boolean;
};

export type RecipePantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: Unit;
  expires_on?: string | null;
};

export type RecipeIngredientStatus = {
  ingredient: RecipeIngredient;
  matches: RecipePantryItem[];
  expiredMatches: RecipePantryItem[];
  availableQuantity: number;
  comparable: boolean;
  enough: boolean | null;
  missingQuantity: number;
};

export function matchesRecipeIngredient(ingredient:RecipeIngredient, foodName:string){
  const food = foodName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const candidates=[ingredient.name,...ingredient.aliases].map(value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()).filter(Boolean);
  return candidates.some(candidate=>food===candidate||food.startsWith(candidate+' ')||candidate.startsWith(food+' '));
}

export function convertRecipeQuantity(quantity:number,from:Unit,to:Unit):number|null{
  if(from===to)return quantity;
  if(from==='kg'&&to==='g')return quantity*1000;
  if(from==='g'&&to==='kg')return quantity/1000;
  if(from==='L'&&to==='ml')return quantity*1000;
  if(from==='ml'&&to==='L')return quantity/1000;
  return null;
}

export function getRecipeIngredientStatuses(recipe:Recipe,pantry:RecipePantryItem[]):RecipeIngredientStatus[]{
  const now=new Date();
  const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  return recipe.ingredients.map(ingredient=>{
    const allMatches=pantry.filter(item=>matchesRecipeIngredient(ingredient,item.name));
    const expiredMatches=allMatches.filter(item=>!!item.expires_on&&item.expires_on<today);
    const matches=allMatches.filter(item=>!item.expires_on||item.expires_on>=today);
    if(recipe.presenceOnly){
      return{ingredient,matches,expiredMatches,availableQuantity:matches.length?1:0,comparable:false,enough:matches.length>0,missingQuantity:matches.length?0:1};
    }
    let availableQuantity=0;
    let comparable=false;
    for(const item of matches){
      const amount=convertRecipeQuantity(item.quantity,item.unit,ingredient.unit);
      if(amount===null)continue;
      comparable=true;
      availableQuantity+=amount;
    }
    const enough=comparable?availableQuantity+1e-8>=ingredient.quantity:matches.length?null:false;
    const missingQuantity=comparable?Math.max(0,ingredient.quantity-availableQuantity):matches.length?0:ingredient.quantity;
    return{ingredient,matches,expiredMatches,availableQuantity,comparable,enough,missingQuantity};
  });
}

export const recipes:Recipe[]=[
  {
    id:'cheese-omelette',name:'Omelete de queijo',description:'Uma refeição rápida, com poucos ingredientes.',minutes:10,servings:1,
    ingredients:[
      {name:'Ovos',aliases:['ovo','ovos caipiras'],quantity:2,unit:'unidades'},
      {name:'Queijo',aliases:['queijo minas','mussarela','muçarela','parmesão','cheddar'],quantity:30,unit:'g'},
      {name:'Leite',aliases:['leite integral','leite desnatado'],quantity:20,unit:'ml'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:5,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:1,unit:'g'}
    ],
    instructions:['Bata os ovos com o leite e uma pitada de sal.','Aqueça o azeite ou óleo em uma frigideira.','Despeje os ovos, espalhe o queijo e cozinhe em fogo baixo até firmar. Dobre ao meio e sirva.']
  },
  {
    id:'simple-pancakes',name:'Panquecas simples',description:'Panquecas macias para o café da manhã.',minutes:15,servings:2,
    ingredients:[
      {name:'Ovos',aliases:['ovo','ovos caipiras'],quantity:1,unit:'unidades'},
      {name:'Leite',aliases:['leite integral','leite desnatado'],quantity:200,unit:'ml'},
      {name:'Farinha de trigo',aliases:['farinha trigo'],quantity:100,unit:'g'},
      {name:'Manteiga',aliases:['manteiga sem sal'],quantity:10,unit:'g'}
    ],
    instructions:['Misture o ovo e o leite. Acrescente a farinha aos poucos até a massa ficar lisa.','Aqueça uma frigideira untada com um pouco de manteiga.','Coloque pequenas porções de massa e doure dos dois lados.']
  },
  {
    id:'oatmeal-porridge',name:'Mingau de aveia',description:'Uma opção quente e simples com leite e aveia.',minutes:8,servings:1,
    ingredients:[
      {name:'Aveia',aliases:['aveia em flocos','farelo de aveia'],quantity:50,unit:'g'},
      {name:'Leite',aliases:['leite integral','leite desnatado'],quantity:250,unit:'ml'},
      {name:'Banana',aliases:['bananas'],quantity:1,unit:'unidades'},
      {name:'Mel',aliases:['mel puro'],quantity:10,unit:'g'}
    ],
    instructions:['Misture a aveia e o leite em uma panela.','Cozinhe em fogo baixo por alguns minutos, mexendo até engrossar.','Sirva com banana fatiada e mel.']
  },
  {
    id:'garlic-pasta',name:'Macarrão alho e óleo',description:'Um clássico rápido para aproveitar itens básicos da despensa.',minutes:18,servings:2,
    ingredients:[
      {name:'Macarrão',aliases:['massa','pasta','espaguete','penne'],quantity:200,unit:'g'},
      {name:'Alho',aliases:['dentes de alho'],quantity:2,unit:'unidades'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:25,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Cozinhe o macarrão em água com sal e reserve um pouco da água do cozimento.','Fatie o alho e aqueça lentamente no azeite, sem deixar queimar.','Misture o macarrão com o alho e um pouco da água reservada.']
  },
  {
    id:'garlic-rice',name:'Arroz refogado',description:'Acompanhamento fácil para refeições do dia a dia.',minutes:25,servings:3,
    ingredients:[
      {name:'Arroz',aliases:['arroz branco','arroz agulhinha','arroz integral'],quantity:200,unit:'g'},
      {name:'Alho',aliases:['dentes de alho'],quantity:1,unit:'unidades'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:10,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Lave o arroz se esse for seu costume e escorra.','Refogue o alho no óleo, acrescente o arroz e misture por um minuto.','Adicione água suficiente para cozinhar, tempere com sal e cozinhe até ficar macio.']
  },
  {
    id:'banana-smoothie',name:'Vitamina de banana',description:'Bebida cremosa para usar banana madura.',minutes:5,servings:1,
    ingredients:[
      {name:'Banana',aliases:['bananas'],quantity:1,unit:'unidades'},
      {name:'Leite',aliases:['leite integral','leite desnatado'],quantity:250,unit:'ml'},
      {name:'Iogurte',aliases:['iogurte grego','iogurte natural'],quantity:100,unit:'g'},
      {name:'Aveia',aliases:['aveia em flocos','farelo de aveia'],quantity:15,unit:'g'}
    ],
    instructions:['Descasque a banana e coloque no liquidificador com leite e iogurte.','Acrescente a aveia e bata até ficar homogêneo.','Sirva na hora.']
  },
  {
    id:'tuna-sandwich',name:'Sanduíche de atum',description:'Uma opção prática para almoço leve ou lanche.',minutes:10,servings:1,
    ingredients:[
      {name:'Pão',aliases:['pão de forma','pão integral','fatias de pão'],quantity:2,unit:'unidades'},
      {name:'Atum',aliases:['atum em lata','atum sólido'],quantity:1,unit:'latas'},
      {name:'Maionese',aliases:['maionese tradicional'],quantity:15,unit:'g'},
      {name:'Limão',aliases:['limões','suco de limão'],quantity:10,unit:'ml'}
    ],
    instructions:['Escorra o atum e misture com a maionese e algumas gotas de limão.','Coloque a mistura sobre o pão.','Sirva imediatamente ou mantenha refrigerado até servir.']
  },
  {
    id:'potato-eggs',name:'Batata com ovos',description:'Uma refeição simples de frigideira.',minutes:20,servings:2,
    ingredients:[
      {name:'Batata',aliases:['batatas'],quantity:2,unit:'unidades'},
      {name:'Ovos',aliases:['ovo','ovos caipiras'],quantity:2,unit:'unidades'},
      {name:'Cebola',aliases:['cebolas'],quantity:0.5,unit:'unidades'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:10,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Corte a batata em cubos pequenos e cozinhe até começar a amaciar.','Refogue a cebola e a batata em uma frigideira com azeite ou óleo.','Acrescente os ovos batidos, tempere com sal e cozinhe até firmar.']
  },
  {
    id:'yogurt-bowl',name:'Iogurte com banana e aveia',description:'Monte em poucos minutos e aproveite frutas maduras.',minutes:5,servings:1,
    ingredients:[
      {name:'Iogurte',aliases:['iogurte grego','iogurte natural'],quantity:200,unit:'g'},
      {name:'Banana',aliases:['bananas'],quantity:1,unit:'unidades'},
      {name:'Aveia',aliases:['aveia em flocos','farelo de aveia'],quantity:20,unit:'g'},
      {name:'Mel',aliases:['mel puro'],quantity:10,unit:'g'}
    ],
    instructions:['Coloque o iogurte em uma tigela.','Acrescente a banana fatiada e a aveia.','Finalize com mel e sirva.']
  },
  {
    id:'quick-vegetable-soup',name:'Sopa rápida de legumes',description:'Uma forma flexível de usar legumes que estão na geladeira.',minutes:30,servings:2,
    ingredients:[
      {name:'Batata',aliases:['batatas'],quantity:2,unit:'unidades'},
      {name:'Cenoura',aliases:['cenouras'],quantity:1,unit:'unidades'},
      {name:'Cebola',aliases:['cebolas'],quantity:0.5,unit:'unidades'},
      {name:'Alho',aliases:['dentes de alho'],quantity:1,unit:'unidades'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:10,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Corte os legumes em pedaços pequenos.','Refogue a cebola e o alho no azeite, acrescente os legumes e cubra com água.','Cozinhe até amaciar, tempere com sal e sirva; se preferir, bata parte da sopa para engrossar.']
  },
  {
    id:'chicken-rice',name:'Frango com arroz',description:'Uma refeição completa com ingredientes do dia a dia.',minutes:35,servings:2,
    ingredients:[
      {name:'Frango',aliases:['peito de frango','frango em cubos'],quantity:300,unit:'g'},
      {name:'Arroz',aliases:['arroz branco','arroz agulhinha'],quantity:150,unit:'g'},
      {name:'Alho',aliases:['dentes de alho'],quantity:1,unit:'unidades'},
      {name:'Cebola',aliases:['cebolas'],quantity:0.5,unit:'unidades'},
      {name:'Azeite ou óleo',aliases:['azeite','óleo','oleo'],quantity:10,unit:'ml'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Tempere o frango com sal, alho e cebola.','Doure o frango no óleo, junte o arroz e misture.','Adicione água suficiente para cozinhar o arroz, tampe e cozinhe até que o frango esteja bem cozido e o arroz macio.']
  },
  {
    id:'creamy-tuna-pasta',name:'Macarrão cremoso com atum',description:'Uma receita prática que aproveita atum enlatado.',minutes:20,servings:2,
    ingredients:[
      {name:'Macarrão',aliases:['massa','pasta','espaguete','penne'],quantity:200,unit:'g'},
      {name:'Atum',aliases:['atum em lata','atum sólido'],quantity:1,unit:'latas'},
      {name:'Creme de leite',aliases:['natas'],quantity:100,unit:'ml'},
      {name:'Alho',aliases:['dentes de alho'],quantity:1,unit:'unidades'},
      {name:'Sal',aliases:['sal refinado','sal marinho'],quantity:2,unit:'g'}
    ],
    instructions:['Cozinhe o macarrão e reserve um pouco da água do cozimento.','Aqueça o alho picado, junte o atum escorrido e o creme de leite.','Misture com a massa e ajuste a textura com um pouco da água reservada.']
  },
  {
    id:'cheesy-tapioca-pancake',name:'Panqueca de tapioca com queijo',description:'Lanche de frigideira com poucos ingredientes.',minutes:12,servings:1,
    ingredients:[
      {name:'Ovos',aliases:['ovo','ovos caipiras'],quantity:1,unit:'unidades'},
      {name:'Tapioca',aliases:['goma de tapioca','goma para tapioca'],quantity:50,unit:'g'},
      {name:'Queijo',aliases:['queijo minas','mussarela','muçarela','parmesão','cheddar'],quantity:40,unit:'g'},
      {name:'Iogurte',aliases:['iogurte grego','iogurte natural'],quantity:20,unit:'g'}
    ],
    instructions:['Bata o ovo e misture com a tapioca e o iogurte.','Despeje em uma frigideira antiaderente em fogo baixo.','Acrescente o queijo, dobre a massa e cozinhe dos dois lados até firmar.']
  }
];
