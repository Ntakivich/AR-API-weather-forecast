@weather-provider-integration
Feature: 7-day weather data is fetched from Open-Meteo
  As the team operating the Activity Ranking API,
  we want the service to ask Open-Meteo for exactly the data it needs and to fail clearly
  when Open-Meteo misbehaves
  so that rankings are based on the right forecast and outages are easy to understand.

  These scenarios replace Open-Meteo with a WireMock stub and inspect the requests the
  service sent to it. The service must read the Open-Meteo base URLs from configuration.

  Rule: The service asks Open-Meteo for the chosen place and the next 7 days

    @smoke @critical
    Scenario: The forecast is requested for the place's coordinates, 7 days, in its time zone
      When the user requests activity rankings for "Chamonix"
      Then the weather provider received a forecast request for the coordinates of "Chamonix, FR"
      And that forecast request covers 7 days of daily data in the place's local time

    Scenario: The city name is resolved through Open-Meteo geocoding
      When the user requests activity rankings for "Chamonix"
      Then the weather provider received a geocoding search for "Chamonix"

    Scenario: Marine conditions are requested so surfing can be assessed
      When the user requests activity rankings for "Biarritz"
      Then the weather provider received a marine forecast request for the coordinates of "Biarritz, FR"

    Scenario: A location id is ranked using that place's coordinates
      When the user requests activity rankings for location id 6058560
      Then the weather provider received a forecast request for the coordinates of "London, CA"

    @front-end-experience
    Scenario: Typing in the search box never triggers forecast requests
      Autocomplete fires on every keystroke; fetching forecasts there would waste the
      provider's rate limit and slow down suggestions.

      When the user searches for locations matching "Lon"
      Then the weather provider received no forecast requests

  Rule: Open-Meteo failures become clear, consistent errors

    @resilience @critical
    Scenario Outline: The <provider API> answering with <failure> is reported as <status>
      Given the weather provider <provider API> answers with <failure>
      When the user requests activity rankings for "Chamonix"
      Then the request fails with status <status> and problem type "<problem type>"
      And the problem does not reveal provider URLs or internal error details

      Examples:
        | provider API  | failure                                    | status | problem type                           |
        | forecast API  | an internal server error                   | 502    | /problems/weather-provider-unavailable |
        | forecast API  | a service unavailable page                 | 502    | /problems/weather-provider-unavailable |
        | forecast API  | a malformed JSON body                      | 502    | /problems/weather-provider-unavailable |
        | forecast API  | an unexpected JSON shape                   | 502    | /problems/weather-provider-unavailable |
        | forecast API  | a dropped connection                       | 502    | /problems/weather-provider-unavailable |
        | forecast API  | a response slower than the service timeout | 504    | /problems/weather-provider-timeout     |
        | geocoding API | an internal server error                   | 502    | /problems/weather-provider-unavailable |
        | geocoding API | a response slower than the service timeout | 504    | /problems/weather-provider-timeout     |

    @resilience
    Scenario: A slow provider is cut off within the service's timeout
      The front end shows a spinner while waiting; the service must give up on its own
      instead of leaving the user waiting for as long as the provider takes.

      Given the weather provider forecast API answers with a response slower than the service timeout
      When the user requests activity rankings for "Chamonix"
      Then the request fails with status 504 and problem type "/problems/weather-provider-timeout"
      And the response arrives within the weather provider timeout plus a grace period

    @resilience
    Scenario: Location search reports a geocoding outage instead of "no matches"
      An empty list would tell the user their city does not exist when the provider is down.

      Given the weather provider geocoding API answers with an internal server error
      When the user searches for locations matching "Lon"
      Then the request fails with status 502 and problem type "/problems/weather-provider-unavailable"

    @resilience
    Scenario: A marine API outage only affects surfing
      Losing wave data should not stop a traveller from planning sightseeing or skiing.

      Given the weather provider marine API answers with an internal server error
      When the user requests activity rankings for "Biarritz"
      Then the rankings are returned for "Biarritz, FR"
      And "Surfing" is rated "UNAVAILABLE" on every day
      And no activity other than "Surfing" is rated "UNAVAILABLE" on any day
