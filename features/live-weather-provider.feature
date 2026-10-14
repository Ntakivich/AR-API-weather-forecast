@live-weather-provider
Feature: The weather provider stub stays faithful to the live Open-Meteo API
  As the team relying on a stubbed Open-Meteo for every acceptance scenario,
  we want to check the stub against the real service on demand
  so that a change in Open-Meteo shows up as a failing check, not as green tests built on fiction.

  Runs only with `npm run test:live` (or the "live" option of the GitHub workflow) because it
  depends on the network and on a third party. Values change daily, so only structure,
  documented behaviour and the captured place records are compared.

  Rule: Responses served by the stub have the same structure as live responses

    Scenario: A geocoding search response has the structure the stub serves
      When the live geocoding API is searched for "London"
      Then every field the stub serves for a geocoding search exists in the live response with the same type

    Scenario: A geocoding search without matches omits the results field, as the stub does
      When the live geocoding API is searched for "Xyzzyqwertyville"
      Then the live response has no "results" field

    Scenario: A forecast response has the structure the stub serves
      When the live forecast API is asked for 7 days of daily weather in "Chamonix, FR"
      Then every field the stub serves for a forecast exists in the live response with the same type
      And the live forecast covers 7 consecutive days starting today in "Europe/Paris"

    Scenario: A marine response for an inland place contains only missing wave values
      When the live marine API is asked for 7 days of wave data in "Madrid, ES"
      Then every field the stub serves for a marine forecast exists in the live response with the same type
      And every live wave value is missing

  Rule: Documented error behaviour matches the stub

    Scenario: An unknown location id is rejected with HTTP 400 and a reason
      When the live geocoding API is asked for location id 999999999
      Then the live response has status 400 and reason "Location ID not found."

  Rule: The stub's place catalogue matches live geocoding records

    Scenario: Every catalogued place still has the same name, country, coordinates and time zone
      When each catalogued place is looked up by id in the live geocoding API
      Then every catalogued place matches its live record
