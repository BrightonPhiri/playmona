/* ============================================================
   PLAYMONA — data/pictureRush.js
   Picture Rush's pictures, by theme. Each is a square illustration at
   assets/images/games/pictureRush/<id>.webp, made in Codex from
   docs/art/pictureRush-prompts.md (tools/art/pictureRush.json).
   The game uses a picture only once its file is in the asset manifest.
   ============================================================ */
window.FF = window.FF || {};
FF.data = FF.data || {};

FF.data.pictureRush = {
  themes: [
    { id: "animals", name: "Animals", pictures: [
      ["animals-lions", "Lions at rest"],
      ["animals-elephants", "Elephants at the waterhole"],
      ["animals-giraffes", "Giraffes and acacias"],
      ["animals-zebras", "Zebras crossing"],
      ["animals-cheetahs", "Cheetah cubs"],
      ["animals-gorillas", "Gorilla family"],
      ["animals-hippos", "Hippo pool"],
      ["animals-flamingos", "Flamingo lake"],
      ["animals-parrots", "Rainforest parrots"],
      ["animals-pandas", "Panda in the bamboo"],
      ["animals-tiger", "Tiger by the stream"],
      ["animals-penguins", "Penguin beach"],
      ["animals-koalas", "Koalas in the gum tree"],
      ["animals-reef", "Coral reef"],
      ["animals-farm", "Farmyard"],
      ["animals-fox", "Fox in autumn"]
    ] },
    { id: "nature", name: "Nature & places", pictures: [
      ["nature-waterfall", "Waterfall rainbow"],
      ["nature-beach", "Tropical beach"],
      ["nature-lake", "Mountain lake"],
      ["nature-forest", "Autumn forest"],
      ["nature-meadow", "Flower meadow"],
      ["nature-oasis", "Desert oasis"],
      ["nature-terraces", "Rice terraces"],
      ["nature-tulips", "Tulip fields"],
      ["nature-canyon", "Canyon river"],
      ["nature-jungle", "Jungle river"],
      ["nature-volcano", "Volcano island"],
      ["nature-baobab", "Baobab sunset"],
      ["nature-blossom", "Cherry blossom garden"],
      ["nature-lavender", "Lavender farm"],
      ["nature-aurora", "Northern lights"],
      ["nature-cave", "Crystal cave"]
    ] },
    { id: "food", name: "Food", pictures: [
      ["food-fruit-market", "Fruit market"],
      ["food-pizza", "Pizza night"],
      ["food-breakfast", "Big breakfast"],
      ["food-cakes", "Cake shop"],
      ["food-sushi", "Sushi platter"],
      ["food-picnic", "Picnic in the park"],
      ["food-vegetables", "Vegetable garden"],
      ["food-ice-cream", "Ice cream cart"],
      ["food-braai", "Family braai"],
      ["food-nshima", "Nshima dinner"],
      ["food-sweets", "Sweet shop"],
      ["food-tacos", "Taco feast"],
      ["food-pancakes", "Pancake stack"],
      ["food-spices", "Spice market"],
      ["food-smoothies", "Smoothie bar"],
      ["food-burger", "Burger and chips"]
    ] },
    { id: "city", name: "City & buildings", pictures: [
      ["city-street", "Colourful street"],
      ["city-harbour", "Harbour town"],
      ["city-paris", "Eiffel Tower"],
      ["city-pyramids", "Pyramids"],
      ["city-taj-mahal", "Taj Mahal"],
      ["city-great-wall", "Great Wall"],
      ["city-london", "Tower Bridge"],
      ["city-venice", "Venice canal"],
      ["city-santorini", "Island village"],
      ["city-sydney", "Sydney harbour"],
      ["city-castle", "Hilltop castle"],
      ["city-night-city", "City lights"],
      ["city-market", "Market square"],
      ["city-lighthouse", "Lighthouse coast"],
      ["city-rome", "Colosseum"],
      ["city-liberty", "Statue of Liberty"]
    ] },
    { id: "vehicles", name: "Vehicles & transport", pictures: [
      ["vehicles-steam-train", "Steam train"],
      ["vehicles-balloons", "Hot air balloons"],
      ["vehicles-fire-engine", "Fire engine"],
      ["vehicles-tractor", "Tractor at harvest"],
      ["vehicles-sailing", "Sailing boats"],
      ["vehicles-rocket", "Rocket launch"],
      ["vehicles-helicopter", "Rescue helicopter"],
      ["vehicles-classic-car", "Classic car"],
      ["vehicles-safari", "Safari jeep"],
      ["vehicles-submarine", "Yellow submarine"],
      ["vehicles-cable-car", "Cable car"],
      ["vehicles-bicycles", "Bike ride"],
      ["vehicles-cargo-ship", "Busy port"],
      ["vehicles-airport", "Airport"],
      ["vehicles-tuk-tuk", "Tuk-tuk street"],
      ["vehicles-bus", "Double-decker bus"]
    ] },
    { id: "home", name: "Home & toys", pictures: [
      ["home-toy-shelf", "Toy shelf"],
      ["home-bedroom", "Kids' bedroom"],
      ["home-baking", "Baking day"],
      ["home-games-night", "Games night"],
      ["home-garden", "Garden swing"],
      ["home-treehouse", "Treehouse"],
      ["home-blocks", "Block city"],
      ["home-train-set", "Toy train set"],
      ["home-crafts", "Craft table"],
      ["home-music", "Music corner"],
      ["home-bath", "Bath time"],
      ["home-birthday", "Birthday party"],
      ["home-camping", "Backyard camping"],
      ["home-christmas", "Christmas morning"],
      ["home-reading", "Reading nook"],
      ["home-playground", "Playground"]
    ] }
  ]
};
