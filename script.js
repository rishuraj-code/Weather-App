const API_KEY = "6a93c5d503f0bc179a5027400d01879a";
const API = "https://api.openweathermap.org/data/2.5";

const cityInput = document.getElementById("cityInput");
const searchButton = document.getElementById("searchButton");
const locationButton = document.getElementById("locationButton");
const errorMessage = document.getElementById("errorMessage");
const forecastCards = document.getElementById("forecastCards");
const hourlyCards = document.getElementById("hourlyCards");
const recentCities = document.getElementById("recentCities");
const favoriteCities = document.getElementById("favoriteCities");
const addFavoriteButton = document.getElementById("addFavoriteButton");
const clearRecent = document.getElementById("clearRecent");
const unitSelect = document.getElementById("temperatureUnit");
const alertToggle = document.getElementById("alertToggle");
const alertsSection = document.getElementById("alertsSection");
const weatherAlerts = document.getElementById("weatherAlerts");

const temperature = document.querySelector(".temperature h1");
const feelsLike = document.querySelector(".temperature p");
const condition = document.querySelector(".temperature h3");
const weatherIcon = document.querySelector(".weather-icon");
const weatherLocation = document.querySelector(".weather-location h3");
const weatherDate = document.querySelector(".weather-location p");
const detailValues = document.querySelectorAll(".weather-details strong");

let currentWeather = null;
let displayedWeather = null;
let currentForecast = null;
let unit = "C";
let map = null;
let mapMarker = null;

async function fetchData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

async function loadWeather(city) {
  city = city.trim();
  if (!city) return showError("Please enter a city name.");

  searchButton.disabled = true;
  searchButton.textContent = "...";
  hideError();

  try {
    const data = await fetchData(
      `${API}/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`
    );
    currentWeather = data;
    cityInput.value = data.name;
    displayWeather(data);
    saveRecent(data.name);
    await loadForecast(data.coord.lat, data.coord.lon);
  } catch (error) {
    showError("City not found. Please check the spelling.");
  }

  searchButton.disabled = false;
  searchButton.textContent = "⌕";
}

function displayWeather(data, type = "current") {
  const weather = data.weather[0];

  // Forecast/hourly items do not contain city name, country, or timezone.
  // Use the current city's information for those selected cards.
  const timezone = data.timezone ?? currentWeather?.timezone ?? currentForecast?.city?.timezone ?? 0;
  const cityName = data.name ?? currentWeather?.name ?? currentForecast?.city?.name ?? "Selected Forecast";
  const country = data.sys?.country ?? currentWeather?.sys?.country ?? "";
  const date = new Date((data.dt + timezone) * 1000);

  displayedWeather = data;

  weatherLocation.textContent = `📍 ${cityName}${country ? `, ${country}` : ""}`;
  weatherDate.textContent = date.toUTCString().slice(0, 22);
  condition.textContent = weather.description.replace(/\\b\\w/g, c => c.toUpperCase());
  weatherIcon.innerHTML = `<img src="https://openweathermap.org/img/wn/${weather.icon}@2x.png" alt="${weather.description}">`;

  detailValues[0].textContent = `${data.main.humidity}%`;
  detailValues[1].textContent = `${Math.round(data.wind.speed * 3.6)} km/h`;
  detailValues[2].textContent = `${data.main.pressure} hPa`;
  detailValues[3].textContent = data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : "N/A";

  updateTemperature();
  updateFeelsLike();

  if (type === "current") {
    currentWeather = data;
    updateFavoriteButton();
    updateAlerts(data);
    updateMap(data.coord.lat, data.coord.lon, data.name);
  }
}

async function loadForecast(lat, lon) {
  try {
    currentForecast = await fetchData(
      `${API}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    );
    displayForecast();
    displayHourly();
  } catch (error) {
    forecastCards.innerHTML = '<p class="empty">Forecast unavailable.</p>';
    hourlyCards.innerHTML = '<p class="empty">Hourly forecast unavailable.</p>';
  }
}

function getLocalDateTime(timestamp, timezone) {
  return new Date((timestamp + timezone) * 1000);
}

function getDateKey(timestamp, timezone) {
  return getLocalDateTime(timestamp, timezone).toISOString().slice(0, 10);
}

function displayForecast() {
  const timezone = currentForecast.city.timezone || 0;
  const groups = {};

  currentForecast.list.forEach(item => {
    const key = getDateKey(item.dt, timezone);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const dates = Object.keys(groups).sort();
  forecastCards.innerHTML = "";

  dates.slice(0, 5).forEach((date, index) => {
    const items = groups[date];
    const selected = items.reduce((best, item) => {
      const bestHour = getLocalDateTime(best.dt, timezone).getUTCHours();
      const itemHour = getLocalDateTime(item.dt, timezone).getUTCHours();
      return Math.abs(itemHour - 12) < Math.abs(bestHour - 12) ? item : best;
    });

    const high = Math.max(...items.map(item => item.main.temp_max ?? item.main.temp));
    const low = Math.min(...items.map(item => item.main.temp_min ?? item.main.temp));
    const day = new Date(`${date}T00:00:00Z`);
    const card = document.createElement("div");

    card.className = `forecast-card ${index === 0 ? "active-card" : ""}`;
    card.innerHTML = `
      <p>${index === 0 ? "Today" : day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</p>
      <small>${day.toLocaleDateString("en-US", { day: "2-digit", month: "short", timeZone: "UTC" })}</small>
      <img src="https://openweathermap.org/img/wn/${selected.weather[0].icon}@2x.png" alt="${selected.weather[0].description}">
      <strong>${Math.round(convertTemp(high))}°${unit}</strong>
      <small>${Math.round(convertTemp(low))}°${unit}</small>`;

    card.onclick = () => {
      forecastCards.querySelectorAll(".forecast-card").forEach(item => item.classList.remove("active-card"));
      card.classList.add("active-card");

      displayWeather(selected, "forecast");

      document.getElementById("currentWeather")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };

    forecastCards.appendChild(card);
  });
}

function displayHourly() {
  const timezone = currentForecast.city.timezone || 0;
  const now = Math.floor(Date.now() / 1000);
  const upcoming = currentForecast.list
    .filter(item => item.dt >= now - 5400)
    .slice(0, 5);

  hourlyCards.innerHTML = "";

  upcoming.forEach((item, index) => {
    const date = getLocalDateTime(item.dt, timezone);
    const hour = date.getUTCHours();
    const time = index === 0 && item.dt - now < 5400
      ? "Next"
      : `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
    const card = document.createElement("div");

    card.className = `hour-card ${index === 0 ? "active-card" : ""}`;
    card.innerHTML = `
      <p>${time}</p>
      <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png" alt="${item.weather[0].description}">
      <strong>${Math.round(convertTemp(item.main.temp))}°${unit}</strong>`;
    card.onclick = () => {
      hourlyCards.querySelectorAll(".hour-card").forEach(item => item.classList.remove("active-card"));
      card.classList.add("active-card");

      displayWeather(item, "hourly");

      document.getElementById("currentWeather")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };

    hourlyCards.appendChild(card);
  });

  if (!upcoming.length) {
    hourlyCards.innerHTML = '<p class="empty">Hourly forecast unavailable.</p>';
  }
}

function updateTemperature() {
  if (!displayedWeather) return;
  const temp = Math.round(convertTemp(displayedWeather.main.temp));
  temperature.innerHTML = `${temp}<span>°${unit}</span>`;
}

function updateFeelsLike() {
  if (!displayedWeather) return;
  const feels = Math.round(convertTemp(displayedWeather.main.feels_like ?? displayedWeather.main.temp));
  feelsLike.textContent = `Feels like ${feels}°${unit}`;
}

function convertTemp(celsius) {
  return unit === "F" ? celsius * 9 / 5 + 32 : celsius;
}

function changeUnit(value) {
  unit = value;
  document.getElementById("celsiusButton").classList.toggle("selected", unit === "C");
  document.getElementById("fahrenheitButton").classList.toggle("selected", unit === "F");
  unitSelect.value = unit;
  updateTemperature();
  updateFeelsLike();
  if (currentForecast) {
    displayForecast();
    displayHourly();
  }
}

document.getElementById("celsiusButton").onclick = () => changeUnit("C");
document.getElementById("fahrenheitButton").onclick = () => changeUnit("F");
unitSelect.onchange = event => changeUnit(event.target.value);

searchButton.onclick = () => loadWeather(cityInput.value);
cityInput.onkeydown = event => {
  if (event.key === "Enter") loadWeather(cityInput.value);
};

locationButton.onclick = () => {
  if (!navigator.geolocation) return showError("Location is not supported by your browser.");

  locationButton.disabled = true;
  locationButton.textContent = "Detecting...";
  hideError();

  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { latitude, longitude } = position.coords;
      const data = await fetchData(
        `${API}/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${API_KEY}`
      );
      currentWeather = data;
      cityInput.value = data.name;
      displayWeather(data);
      saveRecent(data.name);
      await loadForecast(data.coord.lat, data.coord.lon);
    } catch (error) {
      showError("Unable to get weather for your location.");
    }

    locationButton.disabled = false;
    locationButton.textContent = "📍 Detect Location";
  }, error => {
    locationButton.disabled = false;
    locationButton.textContent = "📍 Detect Location";
    showError(error.code === 1 ? "Location permission denied." : "Unable to detect your location.");
  });
};

function getStored(name) {
  return JSON.parse(localStorage.getItem(name) || "[]");
}

function saveRecent(city) {
  const cities = getStored("recentCities").filter(item => item.toLowerCase() !== city.toLowerCase());
  cities.unshift(city);
  localStorage.setItem("recentCities", JSON.stringify(cities.slice(0, 5)));
  displayRecent();
}

function displayRecent() {
  const cities = getStored("recentCities");
  recentCities.innerHTML = cities.length ? "" : '<p class="empty">No recent searches</p>';

  cities.forEach(city => {
    const item = document.createElement("div");
    item.className = "city";
    item.innerHTML = `🌤️ <span>${city}</span><b>→</b>`;
    item.onclick = () => loadWeather(city);
    recentCities.appendChild(item);
  });
}

clearRecent.onclick = () => {
  localStorage.removeItem("recentCities");
  displayRecent();
};

function getFavorites() {
  return getStored("favoriteCities");
}

function toggleFavorite(city) {
  const list = getFavorites();
  const index = list.findIndex(item => item.toLowerCase() === city.toLowerCase());

  if (index >= 0) {
    list.splice(index, 1);
  } else {
    if (list.length >= 5) return showError("You can save up to 5 favorite cities.");
    list.unshift(city);
  }

  localStorage.setItem("favoriteCities", JSON.stringify(list));
  displayFavorites();
  updateFavoriteButton();
}

function displayFavorites() {
  const list = getFavorites();
  favoriteCities.innerHTML = list.length ? "" : '<p class="empty">No favorite cities yet</p>';

  list.forEach(city => {
    const item = document.createElement("div");
    item.className = "favorite-city";
    item.innerHTML = `<span>⭐ ${city}</span><button class="remove-favorite">✕</button>`;
    item.onclick = () => loadWeather(city);
    item.querySelector("button").onclick = event => {
      event.stopPropagation();
      toggleFavorite(city);
    };
    favoriteCities.appendChild(item);
  });
}

function updateFavoriteButton() {
  if (!currentWeather) return;
  const saved = getFavorites().some(city => city.toLowerCase() === currentWeather.name.toLowerCase());
  addFavoriteButton.textContent = saved ? "★ Remove Favorite" : "+ Add Current City";
}

addFavoriteButton.onclick = () => {
  if (currentWeather) toggleFavorite(currentWeather.name);
};

function updateAlerts(data) {
  const id = data.weather[0].id;
  const temp = data.main.temp;
  const alerts = [];

  if (id >= 200 && id < 300) alerts.push(["⛈️", "Thunderstorm Alert", "Thunderstorms are expected."]);
  if (id >= 502 && id < 600) alerts.push(["🌧️", "Heavy Rain Alert", "Heavy rainfall is possible."]);
  if (id >= 600 && id < 700) alerts.push(["❄️", "Snow Alert", "Snowfall is expected."]);
  if (temp >= 40) alerts.push(["🔥", "Extreme Heat Alert", "Very high temperature. Stay hydrated."]);
  if (temp <= 5) alerts.push(["🥶", "Cold Weather Alert", "Very low temperature. Keep yourself warm."]);

  weatherAlerts.innerHTML = alerts.length
    ? alerts.map(alert => `<div class="weather-alert"><span class="alert-icon">${alert[0]}</span><div><strong>${alert[1]}</strong><p>${alert[2]}</p></div></div>`).join("")
    : '<div class="no-alert"><b>✓</b><div><strong>No Weather Alerts</strong><p>No severe weather conditions detected.</p></div></div>';
}

alertToggle.onchange = () => {
  alertsSection.style.display = alertToggle.checked ? "" : "none";
};

function updateMap(lat, lon, city) {
  if (!map) {
    map = L.map("weatherMap").setView([lat, lon], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  } else {
    map.setView([lat, lon], 10);
  }

  if (mapMarker) mapMarker.remove();
  mapMarker = L.marker([lat, lon]).addTo(map).bindPopup(city).openPopup();
  setTimeout(() => map.invalidateSize(), 100);
}

document.querySelectorAll(".sidebar-nav a, .mobile-nav button").forEach(link => {
  link.onclick = event => {
    event.preventDefault();
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth" });

    document.querySelectorAll(".sidebar-nav a").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".mobile-nav button").forEach(item => item.classList.remove("mobile-active"));
    link.classList.add(link.matches("button") ? "mobile-active" : "active");
  };
});

function getHour(timestamp, timezone) {
  return new Date((timestamp + timezone) * 1000).getUTCHours();
}

function showError(message) {
  errorMessage.textContent = `⚠️ ${message}`;
}

function hideError() {
  errorMessage.textContent = "";
}

displayRecent();
displayFavorites();
loadWeather("Pune");
