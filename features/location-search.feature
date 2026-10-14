@location-search
Feature: Location search by full or partial name
  As a traveller typing a destination into a search box,
  I want matching cities and towns suggested as I type
  so that I can pick the exact place I mean before seeing activity rankings.

  The front end calls this endpoint on every keystroke (autocomplete), so answers must be
  fast and predictable, and "nothing found" must never be treated as an error.

  Rule: A partial name returns the places whose name starts with it

    @smoke @critical
    Scenario: Typing the start of a city name suggests matching places
      When the user searches for locations matching "Cham"
      Then the search succeeds
      And the matches include "Chamonix, FR"
      And every match has a name starting with "Cham"

    Scenario Outline: Matching ignores letter case and accents when "<typed text>" is typed
      People rarely type accents and mobile keyboards capitalise unpredictably,
      so "zur", "ZÜR" and "zür" must all find Zürich.

      When the user searches for locations matching "<typed text>"
      Then the matches include "<expected place>"

      Examples:
        | typed text | expected place |
        | zür        | Zurich, CH     |
        | ZUR        | Zurich, CH     |
        | Zurich     | Zurich, CH     |
        | chamonix   | Chamonix, FR   |
        | l'aquila   | L’Aquila, IT   |

    Scenario: Leading and trailing spaces are ignored
      When the user searches for locations matching "   Chamonix  "
      Then the matches include "Chamonix, FR"
      And the search echoes the trimmed query "Chamonix"

    Scenario Outline: Prefix matching starts at three characters, "<typed text>" <outcome>
      Two characters only match a place with exactly that name; mirroring Open-Meteo keeps
      suggestions relevant while the user has typed very little.

      When the user searches for locations matching "<typed text>"
      Then the search succeeds
      And "London, GB" is <outcome>

      Examples:
        | typed text | outcome           |
        | Lo         | not among matches |
        | Lon        | among matches     |

  Rule: Same-named places are all suggested, most relevant first, with what tells them apart

    @critical
    Scenario: A name that exists in several countries returns every match ordered by relevance
      When the user searches for locations matching "London"
      Then the matches are, in order:
        | place      |
        | London, GB |
        | London, CA |
        | London, US |

    @front-end-experience
    Scenario: Every match carries the details needed to label it in a dropdown
      The user must be able to tell Paris, France from Paris, Texas without opening a map.

      When the user searches for locations matching "Paris"
      Then the search succeeds
      And every match has a country, a country code, coordinates and a time zone
      And no two matches share the same name, region and country

  Rule: No match is an empty list, not an error

    @critical
    Scenario: A name that matches nothing returns an empty list
      When the user searches for locations matching "Atlantis"
      Then the search succeeds
      And no matches are returned

  Rule: The query and the number of suggestions are validated at their boundaries

    Scenario Outline: A query of <length> characters <verdict>
      When the user searches for locations matching a name of <length> characters
      Then the search <verdict>

      Examples:
        | length | verdict                |
        | 1      | is rejected as invalid |
        | 2      | succeeds               |
        | 100    | succeeds               |
        | 101    | is rejected as invalid |

    Scenario Outline: A <input class> query is rejected with an explanation
      When the user searches for locations matching "<query>"
      Then the search is rejected as invalid
      And the problem names the invalid parameter "query"

      Examples:
        | input class     | query      |
        | empty           | [empty]    |
        | whitespace-only | [3 spaces] |

    Scenario: A search without a query is rejected with an explanation
      When the user searches for locations without a query
      Then the search is rejected as invalid
      And the problem names the invalid parameter "query"

    Scenario Outline: A result limit of <limit> <verdict>
      When the user searches for locations matching "London" with a limit of <limit>
      Then the search <verdict>

      Examples:
        | limit | verdict                                  |
        | 0     | is rejected as invalid                   |
        | 1     | succeeds with at most 1 matches          |
        | 20    | succeeds with at most 20 matches         |
        | 21    | is rejected as invalid                   |

  Rule: Hostile input is handled safely

    @security
    Scenario Outline: A query containing <input class> never causes a server error
      When the user searches for locations matching "<query>"
      Then the response is a handled JSON answer, not a server error

      Examples:
        | input class      | query                     |
        | markup           | <script>alert(1)</script> |
        | SQL syntax       | ' OR '1'='1               |
        | a path traversal | ../../etc/passwd          |
        | non-Latin script | 東京                      |
        | emoji            | 🏔️⛷️                      |

  Rule: Suggestions arrive fast enough for type-ahead

    @front-end-experience
    Scenario: A search is answered within the response time budget
      When the user searches for locations matching "Bia"
      Then the search succeeds
      And the response arrives within the response time budget
