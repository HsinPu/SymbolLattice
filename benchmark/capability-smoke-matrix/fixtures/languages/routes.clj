(ns smoke.routes
  (:require [compojure.core :refer [defroutes GET]]))

(defn health [request]
  {:status 200})

(defroutes app-routes
  (GET "/health" [] health))
