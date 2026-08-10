Rails.application.routes.draw do
  get "/health", to: "health#show"
end

class HealthController
  def show
  end
end
