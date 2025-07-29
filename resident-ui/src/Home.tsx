import { useState, useEffect } from "react";
import { Layout, Menu, message, List, Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Content } = Layout;

const Home: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [refusedCards, setRefusedCards] = useState<Array<{station_id: string; timestamp: string}>>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/cards/refused`)
      .then(response => response.json())
      .then(data => setRefusedCards(data.refused_cards))
      .catch(error => console.error("Error fetching refused cards:", error));
  }, []);

  const handleAddCard = (stationId: string) => {
    fetch(`${API_BASE_URL}/add_card/${stationId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to add card");
        }
        return response.json();
      })
      .then(() => {
        message.success("Card added successfully");
      })
      .catch(error => {
        console.error("Error adding card:", error);
        message.error("Failed to add card");
      });
  };

  return (
    <Layout style={{ 
      minHeight: "100vh",
      maxWidth: "500px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column"
    }}>
      <Content style={{ 
        flex: 1,
        padding: "16px",
        overflowY: "auto",
        backgroundColor: "#fff"
      }}>
        {activeTab === "home" && (
          <div>
            <h1 style={{ 
              fontSize: "24px",
              marginBottom: "16px"
            }}>
              Charge APT
            </h1>
            <List
              header={<h3>Refused Cards</h3>}
              bordered
              dataSource={refusedCards}
              renderItem={item => (
                <List.Item
                  actions={[<Button type="primary" onClick={() => handleAddCard(item.station_id)}>Add Card</Button>]}
                >
                  <div>
                    <strong>Station:</strong> {item.station_id} <br />
                    <strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </Content>

      <Menu
        mode="horizontal"
        selectedKeys={[activeTab]}
        onClick={(e) => setActiveTab(e.key)}
        style={{
          position: "sticky",
          bottom: 0,
          width: "100%",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "center"
        }}
        items={[
          {
            key: "home",
            label: "Charge APT",
            icon: <HomeOutlined />
          }
        ]}
      />
    </Layout>
  );
};

export default Home;
