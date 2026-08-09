import org.springframework.beans.factory.annotation.Value;

class PropertiesConfig {
  @Value("${server.port}")
  private String port;
}
