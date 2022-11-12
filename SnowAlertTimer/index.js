const https = require("https");

module.exports = async function (context, _myTimer) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twClient = require("twilio")(accountSid, authToken);
  const MOUNTAINS = [
    {
      name: "Pat's Peak",
      zipCode: "03242",
    },
    {
      name: "Loon Mountain",
      zipCode: "03251",
    },
    {
      name: "Mount Wachusett",
      zipCode: "01541",
    },
    {
      name: "Sugarloaf",
      zipCode: "04947",
    },
    {
      name: "Sunday River",
      zipCode: "04261",
    },
    {
      name: "Killington",
      zipCode: "05751",
    },
  ];
  const googleKey = process.env.GOOGLE_API_KEY;
  const openWeatherKey = process.env.OPEN_WEATHER_API_KEY;
  context.log("JavaScript HTTP trigger function processed a request.");

  const googleRes = await Promise.all(
    MOUNTAINS.map((mountain) => getLatLng({ zip: mountain.zipCode, key: googleKey }))
  );
  const weatherData = await Promise.all(
    googleRes.map(({ lat, lng }) => getForecast({ lat, lng, key: openWeatherKey }))
  );
  const snowDays = weatherData.map((weatherDays) => {
    const daysWithSnow = weatherDays.filter((day) =>
      day.weather.some((dayWeather) => [600, 601, 602, 620, 621, 622].includes(+dayWeather.id))
    );
    return daysWithSnow.map((snowDay) => new Date(snowDay.dt * 1000));
  });

  const mountainData = MOUNTAINS.map((ea, i) => ({ ...ea, location: googleRes[i], snowDays: snowDays[i] }));

  const hasSnowDays = mountainData.filter((mountain) => Boolean(mountain.snowDays.length));
  let message = "";
  if (hasSnowDays.length > 0) {
    message = "Snow expected at:\n";

    message += hasSnowDays
      .map(
        (mountain) =>
          `${mountain.name} on ${mountain.snowDays.map((day) => day.toLocaleDateString("en-US")).join(", ")}`
      )
      .join("\n");
    Object.keys(process.env)
      .filter((key) => key.startsWith("SENDNUM"))
      .forEach((key) => {
        const twMessage = { from: process.env.TWILIO_NUMBER, body: message, to: process.env[key] };
        twClient.messages.create(twMessage).then((message) => context.log(message.sid));
      });
  }

  context.res = {
    body: message,
  };
};

async function getLatLng({ zip, key }) {
  return new Promise((resolve, reject) => {
    https
      .get(`https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&key=${key}`, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.results[0].geometry.location);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", (err) => reject(err));
  });
}

async function getForecast({ lat, lng, key }) {
  return new Promise((resolve, reject) => {
    https
      .get(
        // `https://api.openweathermap.org/data/2.5/onecall?lat=33.44&lon=-94.04&exclude=hourly,daily&appid=${key}`,
        `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lng}&exclude=current,minutely,hourly&appid=${key}`,
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              resolve(json.daily);
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on("error", (err) => reject(err));
  });
}
