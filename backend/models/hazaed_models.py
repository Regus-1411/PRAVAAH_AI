import joblib
import numpy as np


class HazardModels:

    def __init__(self):

        self.flood_model = joblib.load(
            "models/flood_model.pkl"
        )

        self.fire_model = joblib.load(
            "models/fire_model.pkl"
        )

        self.pollution_model = joblib.load(
            "models/pollution_model.pkl"
        )

        self.weather_model = joblib.load(
            "models/weather_model.pkl"
        )

        self.landslide_model = joblib.load(
            "models/landslide_model.pkl"
        )

        self.gas_model = joblib.load(
            "models/gas_model.pkl"
        )


    def flood(self, data):

        X = np.array([[
            data.rainfall,
            data.water_level,
            data.humidity,
            data.temperature
        ]])

        probability = self.flood_model.predict_proba(X)[0][1]

        return self.format_result(probability)


    def forest_fire(self, data):

        X = np.array([[
            data.temperature,
            data.humidity,
            data.rainfall,
            data.wind_speed
        ]])

        probability = self.fire_model.predict_proba(X)[0][1]

        return self.format_result(probability)


    def air_pollution(self, data):

        X = np.array([[
            data.pm25,
            data.pm10,
            data.co,
            data.no2,
            data.temperature,
            data.humidity
        ]])

        prediction = self.pollution_model.predict(X)[0]

        return {
            "pollution_level": round(float(prediction), 2)
        }


    def extreme_weather(self, data):

        X = np.array([[
            data.temperature,
            data.rainfall,
            data.wind_speed,
            data.pressure
        ]])

        probability = self.weather_model.predict_proba(X)[0][1]

        return self.format_result(probability)


    def landslide(self, data):

        X = np.array([[
            data.rainfall,
            data.slope,
            data.soil_moisture,
            data.temperature
        ]])

        probability = self.landslide_model.predict_proba(X)[0][1]

        return self.format_result(probability)


    def gas_leak(self, data):

        X = np.array([[
            data.gas_concentration,
            data.wind_speed,
            data.temperature,
            data.humidity
        ]])

        probability = self.gas_model.predict_proba(X)[0][1]

        return self.format_result(probability)


    def format_result(self, probability):

        probability = float(probability) * 100

        if probability >= 70:
            risk = "HIGH"

        elif probability >= 40:
            risk = "MEDIUM"

        else:
            risk = "LOW"

        return {
            "probability": round(probability, 2),
            "risk": risk
        }