@activity-rankings
Feature: Activity rankings for a city's next 7 days
  As a traveller who has chosen a destination,
  I want each of the next 7 days to rank Skiing, Surfing, Outdoor Sightseeing and Indoor Sightseeing
  so that I can plan what to do on which day.

  Each day lists all four activities ranked 1 (most suitable) to 4, each with a suitability
  score from 0 to 100, a rating band, and plain-language reasons the front end can display.

  Rule: A city or town name is accepted as input

    @smoke @critical
    Scenario: Rankings are returned for a city name
      When the user requests activity rankings for "Chamonix"
      Then the rankings are returned for "Chamonix, FR"
      And the response satisfies the activity ranking contract

    @critical
    Scenario: A name shared by several places resolves to the most relevant one and lists the others
      Most names exist in several countries. Choosing the most populous match answers the common
      case in a single request, and the alternatives let the front end ask "Not this London?".

      When the user requests activity rankings for "London"
      Then the rankings are returned for "London, GB"
      And the alternative matches are, in order:
        | place      |
        | London, CA |
        | London, US |

    Scenario Outline: "<typed city>" is matched regardless of case, accents, punctuation and spaces
      When the user requests activity rankings for "<typed city>"
      Then the rankings are returned for "<resolved place>"

      Examples:
        | typed city          | resolved place          |
        | chamonix            | Chamonix, FR            |
        | ZÜRICH              | Zurich, CH              |
        | Stratford-upon-Avon | Stratford-upon-Avon, GB |
        | L'Aquila            | L’Aquila, IT            |
        | Rio de Janeiro      | Rio de Janeiro, BR      |

    Scenario: A partial city name is answered with suggestions instead of a guess
      Ranking the wrong place silently is worse than asking: "Chamon" could be several places.

      When the user requests activity rankings for "Chamon"
      Then the location is reported as not found
      And the suggestions include "Chamonix, FR"

    Scenario: An unknown city is reported as not found without suggestions
      When the user requests activity rankings for "Atlantis"
      Then the location is reported as not found
      And there are no suggestions

  Rule: A place chosen from the suggestions is ranked without ambiguity

    @user-journey @critical
    Scenario: The user searches, picks the Canadian London and sees its rankings
      Given the user has searched for locations matching "London"
      When the user picks "London, CA" from the matches
      Then the rankings are returned for "London, CA"
      And there are no alternative matches

    @user-journey
    Scenario: The user switches to an alternative after seeing rankings for the wrong place
      Given the user has requested activity rankings for "Paris"
      And the rankings were returned for "Paris, FR"
      When the user picks the alternative match "Paris, US"
      Then the rankings are returned for "Paris, US"

    Scenario: An identifier that does not exist is reported as not found
      Open-Meteo answers an unknown identifier with HTTP 400; the service must translate that
      into its own 404 rather than blaming the client's request format.

      When the user requests activity rankings for location id 999999999
      Then the location is reported as not found

  Rule: Invalid requests are rejected with an explanation the front end can show

    Scenario Outline: A request with <invalid input> is rejected
      When the user requests activity rankings with <parameters>
      Then the request is rejected as invalid
      And the problem names the invalid parameter "<invalid parameter>"

      Examples:
        | invalid input                     | parameters                    | invalid parameter |
        | no location at all                | (no parameters)               | city              |
        | an empty city name                | city=[empty]                  | city              |
        | a whitespace-only city name       | city=[3 spaces]               | city              |
        | a one-character city name         | city=L                        | city              |
        | a city name of 101 characters     | city=[101 letters]            | city              |
        | a non-numeric location id         | locationId=abc                | locationId        |
        | a zero location id                | locationId=0                  | locationId        |
        | a negative location id            | locationId=-5                 | locationId        |
        | a fractional location id          | locationId=1.5                | locationId        |

    Scenario: A request with both a city name and a location id is rejected as contradictory
      When the user requests activity rankings with city=Paris & locationId=6058560
      Then the request is rejected as invalid
      And the problem names the invalid parameters "city" and "locationId"

    Scenario: A city name of exactly 100 characters is valid but unknown
      When the user requests activity rankings with city=[100 letters]
      Then the location is reported as not found

    @security
    Scenario Outline: A city name containing <input class> never causes a server error
      When the user requests activity rankings for "<city>"
      Then the response is a handled JSON answer, not a server error

      Examples:
        | input class      | city                      |
        | markup           | <script>alert(1)</script> |
        | SQL syntax       | ' OR '1'='1               |
        | a path traversal | ../../etc/passwd          |

  Rule: The response covers every activity on each of the next 7 days

    @contract @critical
    Scenario: The rankings cover 7 consecutive days starting today at the location
      When the user requests activity rankings for "Chamonix"
      Then the response satisfies the activity ranking contract
      And the rankings cover 7 consecutive days starting today in "Europe/Paris"

    Scenario Outline: "Today" is the date in <city>, not the server's date
      A traveller in Auckland is up to a day ahead of the server; the first day shown must
      be their today, or the whole week is shifted.

      When the user requests activity rankings for "<city>"
      Then the rankings cover 7 consecutive days starting today in "<time zone>"

      Examples:
        | city     | time zone        |
        | Auckland | Pacific/Auckland |
        | Honolulu | Pacific/Honolulu |

    @contract
    Scenario: Every day lists each activity exactly once, ordered by rank
      When the user requests activity rankings for "Biarritz"
      Then every day lists Skiing, Surfing, Outdoor Sightseeing and Indoor Sightseeing exactly once
      And every day's activities are ordered by rank from 1 to 4
      And every day ranks a higher-scoring activity above a lower-scoring one

    @contract
    Scenario: The suitability rating always agrees with the suitability score
      When the user requests activity rankings for "Biarritz"
      Then every suitability rating matches the band of its score:
        | rating    | lowest score | highest score |
        | POOR      | 0            | 24            |
        | FAIR      | 25           | 49            |
        | GOOD      | 50           | 74            |
        | EXCELLENT | 75           | 100           |

    @front-end-experience
    Scenario: Every activity explains its assessment in plain language
      Given the weather in "Chamonix" is "heavy snow and freezing" all week
      When the user requests activity rankings for "Chamonix"
      Then every activity has at least one reason
      And no reason exposes provider codes, field names or missing values
      And the reasons for "Skiing" mention the snowfall in centimetres

    @front-end-experience
    Scenario: Rankings are answered within the response time budget
      When the user requests activity rankings for "Lisbon"
      Then the rankings are returned for "Lisbon, PT"
      And the response arrives within the response time budget
