# Veil learning — override rate by bucket (R optional)

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("Install jsonlite: install.packages('jsonlite')")
}

args <- commandArgs(trailingOnly = TRUE)
days <- if (length(args) >= 1) as.integer(args[1]) else 30L

if (Sys.getenv("DATABASE_URL") == "") {
  stop("Set DATABASE_URL")
}

if (!requireNamespace("RPostgres", quietly = TRUE)) {
  stop("Install RPostgres: install.packages('RPostgres')")
}

con <- DBI::dbConnect(RPostgres::Postgres(), conninfo = Sys.getenv("DATABASE_URL"))
on.exit(DBI::dbDisconnect(con), add = TRUE)

sql <- sprintf("
  SELECT host, category, action, outcome, features
  FROM security_events
  WHERE event_type = 'decision' AND event_at >= now() - interval '%d days'
  UNION ALL
  SELECT host, category, action, outcome, features
  FROM platform_decision_events
  WHERE event_type = 'decision' AND event_at >= now() - interval '%d days'
", days, days)

rows <- DBI::dbGetQuery(con, sql)
if (nrow(rows) == 0) {
  cat("No decision rows\n")
  quit(save = "no", status = 0)
}

parse_intent <- function(features_json) {
  f <- tryCatch(jsonlite::fromJSON(features_json), error = function(e) list())
  if (is.null(f$intent)) "" else as.character(f$intent)
}

parse_sem <- function(features_json) {
  f <- tryCatch(jsonlite::fromJSON(features_json), error = function(e) list())
  if (length(f$fieldSemantics) < 1) "" else as.character(f$fieldSemantics[[1]])
}

rows$intent <- vapply(rows$features, parse_intent, character(1))
rows$field_semantic <- vapply(rows$features, parse_sem, character(1))

agg <- aggregate(
  cbind(
    prompt = ifelse(rows$action == "prompt", 1, 0),
    override = ifelse(rows$outcome == "overrode" | rows$action == "ignore", 1, 0)
  ) ~ host + category + intent + field_semantic,
  data = rows,
  FUN = sum
)

agg$override_pct <- round(100 * agg$override / pmax(1, agg$prompt + agg$override), 1)
agg <- agg[order(-agg$override_pct, -agg$prompt), ]

print(head(agg, 20))
cat(sprintf("\n%d buckets\n", nrow(agg)))
