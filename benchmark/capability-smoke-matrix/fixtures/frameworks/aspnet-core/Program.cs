var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/items", Items);

static string Items() => "items";

app.Run();
