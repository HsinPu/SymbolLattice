local lapis = require("lapis")
local app = lapis.Application()

local function health(self)
  return "ok"
end

app:get("/health", health)
